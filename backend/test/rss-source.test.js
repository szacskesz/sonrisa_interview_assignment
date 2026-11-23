import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minute, startFakeFeed } from '../fixtures/fake-rss.js';
import { createRssSource } from '../src/rss-source.js';

const anchor = Date.parse('2026-11-23T09:02:00.000Z');
const url = 'http://127.0.0.1:18080/rss.xml';
const xml = (items = '') => `<rss version="2.0"><channel><title>Fixture</title>${items}</channel></rss>`;
const article = (time) => `<item><title>News</title><guid>${time}</guid><pubDate>${new Date(time).toUTCString()}</pubDate></item>`;
const source = (body, status = 200) => createRssSource(url, { fetchFeed: async () => new Response(body, { status }) });

test('discovers the latest article and reads fixture pages over HTTP', async (t) => {
  const fixture = await startFakeFeed({ now: () => anchor + 2 * minute, pageSize: 1 });
  t.after(fixture.close);
  const rss = createRssSource(fixture.url);
  const through = await rss.latest();
  assert.equal(through, anchor + 2 * minute);
  const [item] = await rss.page(anchor + 500, through);
  const id = new Date(anchor + minute).toISOString();
  assert.deepEqual(item, { id, title: `News ${id}`, url: `https://example.test/news/${id}`, publishedAt: anchor + minute });
  assert.equal((await rss.page(item.publishedAt, through))[0].publishedAt, through);
  assert.deepEqual(await rss.page(through, through), []);
});

test('distinguishes empty snapshots, invalid XML, invalid items, and HTTP errors', async () => {
  assert.equal(await source(xml()).latest(), null);
  await assert.rejects(source('<rss><channel><title>Broken</title>').latest(), /malformed/);
  await assert.rejects(source(xml('<item />')).latest(), /malformed/);
  await assert.rejects(source(xml('<item><title>Missing GUID</title></item>')).latest(), /malformed/);
  await assert.rejects(source(xml(article(anchor) + article(anchor + minute))).latest(), /more than one/);
  await assert.rejects(source('x'.repeat(1_048_577)).latest(), /size limit/);
  await assert.rejects(source('Unavailable', 503).latest(), /HTTP 503/);
});

test('rejects empty, skipped, repeated and out-of-order replay articles', async () => {
  const first = article(anchor + minute);
  const second = article(anchor + 2 * minute);
  for (const items of ['', second, second + first, first + first, first + second + article(anchor + 3 * minute)]) {
    await assert.rejects(source(xml(items)).page(anchor, anchor + 2 * minute), /replay page/);
  }
});
