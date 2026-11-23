import { once } from 'node:events';
import { createServer } from 'node:http';
import { URL } from 'node:url';

export const minute = 60_000;

function itemXml(timestamp) {
  const date = new Date(timestamp);
  const id = date.toISOString();
  const headline = `News ${id}`;
  return `<item>
    <title>${headline}</title>
    <description>${headline}</description>
    <link>https://example.test/news/${id}</link>
    <guid isPermaLink="false">${id}</guid>
    <pubDate>${date.toUTCString()}</pubDate>
  </item>`;
}

function rssXml(items) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Sonrisa Demo News</title>
  <link>https://example.test/news</link>
  <description>Synthetic news published once per UTC minute</description>
  ${items.map(itemXml).join('\n')}
</channel></rss>`;
}

export async function startFakeFeed({ now = Date.now, port = 0, pageSize = 100 } = {}) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== '/rss.xml') {
      response.writeHead(404).end();
      return;
    }

    const latest = Math.floor(now() / minute) * minute;
    const after = url.searchParams.get('after');
    const through = url.searchParams.get('through');
    if (after === null && through === null) {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
      response.end(rssXml([latest]));
      return;
    }

    const lower = Date.parse(after ?? '');
    const upper = Date.parse(through ?? '');
    if (!Number.isFinite(lower) || !Number.isFinite(upper) ||
        lower % minute !== 0 || upper % minute !== 0 || upper < lower || upper > latest) {
      response.writeHead(400).end('Expected UTC minute bounds within the published feed');
      return;
    }

    const items = [];
    const end = Math.min(upper, lower + pageSize * minute);
    for (let timestamp = lower + minute; timestamp <= end; timestamp += minute) {
      items.push(timestamp);
    }
    response.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8' });
    response.end(rssXml(items));
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}/rss.xml`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

if (import.meta.main) {
  const feed = await startFakeFeed({ port: 18080 });
  console.log(`Fake RSS available at ${feed.url}`);
}
