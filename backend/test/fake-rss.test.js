import assert from 'node:assert/strict';
import { test } from 'node:test';
import { minute, startFakeFeed } from '../fixtures/fake-rss.js';

const anchor = Date.parse('2026-11-23T09:02:00.000Z');
const iso = (ms) => new Date(ms).toISOString();

test('publishes one stable headline per UTC minute and replays ordered bounded pages', async (t) => {
  let now = anchor + 59_999;
  const feed = await startFakeFeed({ now: () => now, pageSize: 2 });
  t.after(feed.close);
  const latest = await fetch(feed.url);
  assert.equal(latest.headers.get('content-type'), 'application/rss+xml; charset=utf-8');
  const xml = await latest.text();
  assert.match(xml, /<title>News 2026-11-23T09:02:00.000Z<\/title>/);
  assert.match(xml, /<description>News 2026-11-23T09:02:00.000Z<\/description>/);
  assert.match(xml, /<pubDate>Mon, 23 Nov 2026 09:02:00 GMT<\/pubDate>/);
  assert.equal((await fetch(feed.url).then((response) => response.text())), xml);
  now = anchor + 4 * minute;
  assert.match(await fetch(feed.url).then((response) => response.text()), /News 2026-11-23T09:06:00.000Z/);
  async function read(after, through) {
    const response = await fetch(`${feed.url}?${new URLSearchParams({ after: iso(after), through: iso(through) })}`);
    assert.equal(response.status, 200);
    return [...(await response.text()).matchAll(/<guid isPermaLink="false">([^<]+)<\/guid>/g)].map((match) => match[1]);
  }
  const through = anchor + 3 * minute;
  assert.deepEqual(await read(anchor, through), [iso(anchor + minute), iso(anchor + 2 * minute)]);
  assert.deepEqual(await read(anchor + 2 * minute, through), [iso(through)]);
  assert.deepEqual(await read(through, through), []);
});

test('rejects unsupported routes, methods and invalid replay bounds', async (t) => {
  const feed = await startFakeFeed({ now: () => anchor });
  t.after(feed.close);
  assert.equal((await fetch(new URL('/', feed.url))).status, 404);
  assert.equal((await fetch(feed.url, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${feed.url}?after=${iso(anchor)}`)).status, 400);
  assert.equal((await fetch(`${feed.url}?after=${iso(anchor)}&through=${iso(anchor + minute)}`)).status, 400);
  assert.equal((await fetch(`${feed.url}?after=${iso(anchor - 1)}&through=${iso(anchor)}`)).status, 400);
  await assert.rejects(startFakeFeed({ pageSize: 0 }), /page size/);
});
