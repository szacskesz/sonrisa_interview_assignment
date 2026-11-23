import { createHash } from 'node:crypto';
import { parseFeed, parseRssFeed } from 'feedsmith';
import { XMLParser } from 'fast-xml-parser';
import { fetchPublicRss } from './rss-http.js';

const minute = 60_000;
const maxFeedLength = 1_048_576;
const xmlParser = new XMLParser({
  processEntities: false,
  isArray: (_name, path) => path === 'rss.channel.item',
});

function normalizeFixtureItems(xml) {
  try {
    const { rss } = xmlParser.parse(xml, true);
    const { title, items = [] } = parseRssFeed(xml);
    if (typeof title !== 'string' || !title.trim() || items.length !== (rss?.channel?.item?.length ?? 0)) {
      throw new Error('Invalid feed structure');
    }
    return items.map((item) => {
      const publishedAt = Date.parse(item.pubDate ?? '');
      if (!item.guid?.value || !item.title?.trim() || !Number.isFinite(publishedAt) || publishedAt % minute !== 0) {
        throw new Error('Invalid article fields');
      }
      const link = item.link ? new URL(item.link) : null;
      if (link && !['http:', 'https:'].includes(link.protocol)) throw new Error('Invalid article link');
      return { id: item.guid.value, title: item.title, url: link?.href ?? null, publishedAt };
    });
  } catch (cause) {
    throw new Error('RSS response contains malformed feed data', { cause });
  }
}

async function readXml(url, fetchFeed) {
  const response = await fetchFeed(url, {
    redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`RSS request returned HTTP ${response.status}`);
  }
  const chunks = [];
  let length = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > maxFeedLength) throw new Error('RSS response exceeded the size limit');
      chunks.push(chunk);
    }
  }
  const bytes = Buffer.concat(chunks, length);
  const prefix = bytes.toString('latin1', 0, 256);
  const declared = /^<\?xml\s+[^?]*\bencoding=["']([^"']+)["']/i.exec(prefix)?.[1];
  const charset = /\bcharset\s*=\s*["']?([^;"'\s]+)/i.exec(response.headers.get('content-type') ?? '')?.[1];
  let encoding = declared ?? charset ?? 'utf-8';
  if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0 && bytes[1] === 0x3c)) encoding = 'utf-16be';
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0)) encoding = 'utf-16le';
  const xml = new TextDecoder(encoding).decode(bytes);
  if (/<!ENTITY\s/i.test(xml)) throw new Error('RSS response contains unsupported XML entity declarations');
  return { xml, url: response.url || url };
}

/** Fetch normalized articles from the synthetic fixture and validate its replay contract. */
export function createFixtureRssSource(feedUrl, { fetchFeed = fetch } = {}) {
  async function read(url) {
    const { xml } = await readXml(url, fetchFeed);
    return normalizeFixtureItems(xml);
  }

  return {
    async latest() {
      const items = await read(feedUrl);
      if (items.length > 1) throw new Error('RSS snapshot contains more than one article');
      return items[0]?.publishedAt ?? null;
    },
    async page(after, through) {
      const lower = Math.floor(after / minute) * minute;
      if (through <= lower) return [];
      const url = new URL(feedUrl);
      url.searchParams.set('after', new Date(lower).toISOString());
      url.searchParams.set('through', new Date(through).toISOString());
      const items = await read(url);
      if (items.length === 0 || items.length > 100 || new Set(items.map(({ id }) => id)).size !== items.length ||
          items.some(({ publishedAt }, index) => publishedAt !== lower + (index + 1) * minute || publishedAt > through)) {
        throw new Error('RSS replay page is missing articles or violates publication order');
      }
      return items;
    },
  };
}

function itemLink(value, base) {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Read the current RSS 2.0 or RSS 1.0 snapshot without assuming replay or publication order. */
export function createRssSource(feedUrl, { fetchFeed = fetchPublicRss } = {}) {
  return {
    async snapshot() {
      const { xml, url: base } = await readXml(feedUrl, fetchFeed);
      try {
        xmlParser.parse(xml, true);
        const { format, feed } = parseFeed(xml);
        if (!['rss', 'rdf'].includes(format)) throw new Error('Expected an RSS document');
        const items = new Map();
        for (const item of feed.items ?? []) {
          const title = item.title?.trim() || item.description?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (!title) continue;
          const url = item.link ? itemLink(item.link, base) : null;
          const date = Date.parse(item.pubDate ?? item.dc?.dates?.[0] ?? '');
          const publishedAt = Number.isFinite(date) ? date : null;
          const identity = item.guid?.value ? ['guid', item.guid.value] :
            url ? ['url', url] : ['content', title, item.description ?? '', publishedAt];
          const id = createHash('sha256').update(JSON.stringify(identity)).digest('base64url');
          if (!items.has(id)) items.set(id, { id, title: title.slice(0, 1_000), url, publishedAt });
        }
        if ((feed.items?.length ?? 0) > 0 && items.size === 0) throw new Error('RSS has no readable items');
        return [...items.values()];
      } catch (cause) {
        throw new Error('RSS response contains malformed feed data', { cause });
      }
    },
  };
}
