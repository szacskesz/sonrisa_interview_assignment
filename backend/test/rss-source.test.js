import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minute, startFakeFeed } from '../fixtures/fake-rss.js';
import { createFixtureRssSource, createRssSource } from '../src/rss-source.js';

const anchor = Date.parse('2026-11-23T09:02:00.000Z');
const url = 'http://127.0.0.1:18080/rss.xml';
const xml = (items = '') => `<rss version="2.0"><channel><title>Fixture</title>${items}</channel></rss>`;
const article = (time) => `<item><title>News</title><guid>${time}</guid><pubDate>${new Date(time).toUTCString()}</pubDate></item>`;
const source = (body, status = 200) => createFixtureRssSource(url, { fetchFeed: async () => new Response(body, { status }) });

test('discovers the latest article and reads fixture pages over HTTP', async (t) => {
  const fixture = await startFakeFeed({ now: () => anchor + 2 * minute, pageSize: 1 });
  t.after(fixture.close);
  const rss = createFixtureRssSource(fixture.url);
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

test('reads ordinary RSS snapshots with non-minute dates, optional item fields, and duplicate IDs', async () => {
  const url = 'https://rss.example.test/feed?region=HU';
  const body = xml(`
    <item><title>Árvízi hírek</title><guid>one</guid><link>/news</link><pubDate>Mon, 23 Nov 2026 09:02:23 GMT</pubDate></item>
    <item><description><![CDATA[<p>Summary only</p>]]></description></item>
    <item><title>Duplicate</title><guid>one</guid></item>
    <item><title>No GUID</title><link>/another</link><pubDate>Mon, 23 Nov 2026 09:02:23 GMT</pubDate></item>
  `);
  const rss = createRssSource(url, { fetchFeed: async (actual) => {
    assert.equal(actual, url);
    return new Response(body);
  } });
  const items = await rss.snapshot();
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(({ title, url, publishedAt }) => [title, url, publishedAt]), [
    ['Árvízi hírek', 'https://rss.example.test/news', anchor + 23_000],
    ['Summary only', null, null],
    ['No GUID', 'https://rss.example.test/another', anchor + 23_000],
  ]);
  assert.equal(new Set(items.map(({ id }) => id)).size, 3);
  assert.deepEqual(await rss.snapshot(), items);
});

test('reads an RSS 1.0 RDF feed', async () => {
  const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel rdf:about="https://rss.example.test/feed"><title>RDF feed</title><link>https://rss.example.test/</link>
      <description>Test feed</description><items><rdf:Seq><rdf:li rdf:resource="https://rss.example.test/story"/></rdf:Seq></items>
    </channel>
    <item rdf:about="https://rss.example.test/story"><title>RDF story</title><link>https://rss.example.test/story</link>
      <dc:date>2026-11-23T09:02:00.000Z</dc:date></item>
    </rdf:RDF>`;
  const rss = createRssSource('https://rss.example.test/feed', { fetchFeed: async () => new Response(rdf) });
  const [item] = await rss.snapshot();
  assert.equal(item.title, 'RDF story');
  assert.equal(item.publishedAt, anchor);
});
