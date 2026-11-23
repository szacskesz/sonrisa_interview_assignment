import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFixtureUrl } from '../src/feeds.js';
import { createApiFixture } from '../test-support/api.js';

test('requires a session and returns distinct, sorted topics from enabled feeds only', async (t) => {
  const urls = [defaultFixtureUrl, ...[18081, 18082, 18083].map((port) => `http://127.0.0.1:${port}/rss.xml`)];
  const { app, request } = await createApiFixture(t, { trustedUrls: urls });
  assert.equal((await request(null, 'GET', '/api/topics')).statusCode, 401);
  assert.deepEqual((await request(2, 'GET', '/api/topics')).json(), { topics: [] });
  for (const [index, topic] of ['World', 'World', 'Markets', 'Weather'].entries()) {
    app.services.feeds.create({ url: urls[index], publisher: 'Fixture', topic, enabled: index !== 3 });
  }
  const response = await request(2, 'GET', '/api/topics');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { topics: ['Markets', 'World'] });
});
