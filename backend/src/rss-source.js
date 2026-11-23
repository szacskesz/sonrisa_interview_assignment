import { parseRssFeed } from 'feedsmith';
import { XMLParser } from 'fast-xml-parser';

const minute = 60_000;
const maxFeedLength = 1_048_576;
const xmlParser = new XMLParser({
  processEntities: false,
  isArray: (_name, path) => path === 'rss.channel.item',
});

function normalizeItems(xml) {
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

/** Fetch normalized articles from the trusted demo RSS fixture and validate its replay contract. */
export function createRssSource(feedUrl, { fetchFeed = fetch } = {}) {
  async function read(url) {
    const response = await fetchFeed(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`RSS request returned HTTP ${response.status}`);
    }
    let xml = '';
    if (response.body) {
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
        xml += chunk;
        if (xml.length > maxFeedLength) throw new Error('RSS response exceeded the size limit');
      }
    }
    return normalizeItems(xml);
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
