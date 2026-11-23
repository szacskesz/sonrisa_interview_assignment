import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFixtureUrl } from '../src/feeds.js';
import { createApiFixture } from '../test-support/api.js';

const path = '/api/admin/feeds';
const settings = { url: defaultFixtureUrl, publisher: 'Fixture', topic: 'World', pollIntervalSeconds: 60 };

test('exposes feed settings and recent poll health to administrators only', async (t) => {
  const { app, request } = await createApiFixture(t, { now: () => 100, sourceFor: () => ({ latest: async () => 80 }) });
  assert.equal((await request(null, 'GET', path)).statusCode, 401);
  assert.equal((await request(2, 'GET', path)).statusCode, 403);
  assert.equal((await request(2, 'POST', path, settings)).statusCode, 403);
  assert.equal((await request(2, 'PATCH', `${path}/1`, {})).statusCode, 403);
  assert.deepEqual((await request(1, 'GET', path)).json(), { feeds: [] });
  const response = await request(1, 'POST', path, settings);
  assert.equal(response.statusCode, 201);
  const feed = response.json();
  assert.equal(feed.enabled, true);
  assert.equal(feed.lastPollSuccessAt, null);
  await app.services.pollFeeds();
  const [polled] = (await request(1, 'GET', path)).json().feeds;
  assert.deepEqual([polled.lastPollAttemptAt, polled.lastPollSuccessAt, polled.nextPollAt, polled.lastPollError],
    [100, 100, 60_100, null]);
  const item = `${path}/${feed.id}`;
  assert.equal((await request(1, 'PATCH', item, { enabled: false })).json().enabled, false);
  const enabled = (await request(1, 'PATCH', item, { enabled: true, pollIntervalSeconds: 120 })).json();
  assert.deepEqual([enabled.enabled, enabled.lastPollSuccessAt, enabled.nextPollAt, enabled.pollIntervalSeconds],
    [true, null, 100, 120]);
});

test('accepts public URLs with query parameters and rejects duplicate URLs and bad settings', async (t) => {
  const { request } = await createApiFixture(t);
  const googleUrl = 'https://news.google.com/rss?hl=hu&gl=HU&ceid=HU:hu';
  const google = await request(1, 'POST', path, { ...settings, url: googleUrl });
  assert.equal(google.statusCode, 201);
  assert.equal(google.json().url, googleUrl);
  assert.equal((await request(1, 'POST', path, { ...settings, url: 'file:///feed.xml' })).json().code, 'invalid_feed_url');
  assert.equal((await request(1, 'POST', path, { ...settings, topic: '  ' })).json().code, 'invalid_feed_settings');
  assert.equal((await request(1, 'POST', path, { ...settings, pollIntervalSeconds: 1.5 })).statusCode, 400);
  assert.equal((await request(1, 'POST', path, settings)).statusCode, 201);
  const duplicate = await request(1, 'POST', path, { ...settings, url: 'HTTP://127.0.0.1:18080/rss.xml' });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().code, 'duplicate_feed_url');
  assert.equal((await request(1, 'PATCH', `${path}/99`, { enabled: false })).statusCode, 404);
});
