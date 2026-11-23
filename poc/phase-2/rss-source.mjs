import { parseRssFeed } from 'feedsmith';

async function readItems(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`Feed returned HTTP ${response.status}`);
  }

  const { title: sourceLabel, items = [] } = parseRssFeed(await response.text());
  return items.map(({ guid, title, description, pubDate }) => {
    const publishedAt = Date.parse(pubDate);
    if (!sourceLabel || !guid?.value || !title || !Number.isFinite(publishedAt)) {
      throw new Error('Feed contained a malformed fixture item');
    }
    return { id: guid.value, title, description, publishedAt, sourceLabel, topic: 'world' };
  });
}

export function createRssSource(url) {
  return {
    async latest() {
      const items = await readItems(url);
      if (items.length !== 1) {
        throw new Error('The fixture snapshot must contain one item');
      }
      return items[0].publishedAt;
    },
    async page(after, through) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('after', new Date(after).toISOString());
      pageUrl.searchParams.set('through', new Date(through).toISOString());
      const items = await readItems(pageUrl);
      if (items.length === 0 || items.some((item, index) => {
        const previous = index === 0 ? after : items[index - 1].publishedAt;
        return item.publishedAt <= previous || item.publishedAt > through;
      })) {
        throw new Error('The fixture page is empty, out of order, or outside the requested range');
      }
      return items;
    },
  };
}
