import { once } from 'node:events';
import { createServer } from 'node:http';
import { startFakeFeed } from '../../backend/fixtures/fake-rss.js';

/** Serve the real fake RSS feed through a loopback endpoint that records requests and can fail a replay page. */
export async function startObservedFeed(now) {
  const feed = await startFakeFeed({ now, pageSize: 2 });
  const requests = [];
  let failAfter;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, feed.url);
    if (request.method !== 'GET' || url.pathname !== '/rss.xml') {
      response.writeHead(404).end();
      return;
    }
    const after = url.searchParams.get('after');
    const through = url.searchParams.get('through');
    requests.push({ after, through });
    if (after === failAfter) {
      failAfter = undefined;
      response.writeHead(503).end('Test RSS interruption');
      return;
    }
    try {
      const target = new URL(feed.url);
      target.search = url.search;
      const upstream = await fetch(target, { signal: AbortSignal.timeout(4_000) });
      const body = await upstream.text();
      response.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') ?? 'text/plain',
      }).end(body);
    } catch {
      response.writeHead(502).end('Test fixture unavailable');
    }
  });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
  } catch (error) {
    await feed.close();
    throw error;
  }
  return {
    url: `http://127.0.0.1:${server.address().port}/rss.xml`,
    requests,
    failPageAfter(timestamp) { failAfter = new Date(timestamp).toISOString(); },
    async close() {
      try {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } finally {
        await feed.close();
      }
    },
  };
}
