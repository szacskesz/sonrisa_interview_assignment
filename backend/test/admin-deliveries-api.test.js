import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFixtureUrl } from '../src/feeds.js';
import { createApiFixture } from '../test-support/api.js';

test('restricts and lists the latest 100 delivery outcomes with attempt summaries', async (t) => {
  const { app, request } = await createApiFixture(t);
  const path = '/api/admin/deliveries';
  assert.equal((await request(null, 'GET', path)).statusCode, 401);
  assert.equal((await request(2, 'GET', path)).statusCode, 403);
  assert.deepEqual((await request(1, 'GET', path)).json(), { deliveries: [] });
  const { feeds, queue } = app.services;
  const feed = feeds.create({ url: defaultFixtureUrl, publisher: 'Fixture', topic: 'World' });
  for (let index = 1; index <= 101; index += 1) {
    queue.enqueue({
      feedId: feed.id, sourceUrl: feed.url, itemId: String(index), channel: 'email', destination: 'reader@example.test',
      title: `Headline ${index}`, topic: feed.topic, publisher: feed.publisher, publishedAt: index,
    }, 500);
  }
  const newest = queue.claim(101, 500);
  queue.finish(newest, { status: 'failed', lastError: 'SMTP rejected the message' });
  const response = await request(1, 'GET', path);
  assert.equal(response.statusCode, 200);
  const { deliveries } = response.json();
  assert.equal(deliveries.length, 100);
  assert.deepEqual(deliveries[0], { id: 101, title: 'Headline 101', publisher: 'Fixture',
    channel: 'email', status: 'failed', attemptCount: 1, lastError: 'SMTP rejected the message' });
  assert.equal(deliveries.at(-1).id, 2);
});
