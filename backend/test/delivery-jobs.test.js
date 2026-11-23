import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateDatabase, openDatabase } from '../src/database.js';
import { createDeliveryQueue } from '../src/delivery-jobs.js';
import { createFeedStore, defaultFixtureUrl } from '../src/feeds.js';

function fixture(database) {
  migrateDatabase(database);
  const feed = createFeedStore(database).create({ url: defaultFixtureUrl, topic: 'World', publisher: 'Demo' });
  const queue = createDeliveryQueue(database);
  const message = { feedId: feed.id, sourceUrl: feed.url, itemId: 'article-1', channel: 'email',
    destination: 'reader@example.test', title: 'Headline', topic: 'World', publisher: 'Demo', publishedAt: 5 };
  return { queue, message };
}

test('deduplicates jobs, claims due work, persists retries and keeps completed work complete', () => {
  using database = openDatabase(':memory:');
  const { queue, message } = fixture(database);
  assert.equal(queue.enqueue(message, 10), true);
  assert.equal(queue.enqueue(message, 11), false);
  assert.equal(queue.nextDue(9), undefined);
  const { id } = queue.nextDue(10);
  const first = queue.claim(id, 10);
  assert.equal(first.attempt_count, 1);
  assert.equal(queue.claim(id, 10), undefined);
  assert.equal(queue.finish(first, { status: 'pending', nextAttemptAt: 30, lastError: 'Temporary problem' }), true);
  assert.equal(queue.nextDue(29), undefined);
  const second = queue.claim(id, 30);
  assert.equal(second.attempt_count, 2);
  assert.equal(second.last_error, 'Temporary problem');
  assert.equal(queue.finish(first, { status: 'failed' }), false);
  assert.equal(queue.finish(second, { status: 'sent', sentAt: 31 }), true);
  assert.equal(queue.enqueue(message, 32), false);
  assert.equal(queue.nextDue(32), undefined);
});

test('keeps channels and destinations distinct and recovers interrupted attempts', () => {
  using database = openDatabase(':memory:');
  const { queue, message } = fixture(database);
  queue.enqueue(message, 10);
  assert.equal(queue.enqueue({ ...message, destination: 'other@example.test' }, 10), true);
  assert.equal(queue.enqueue({ ...message, channel: 'example-channel' }, 10), true);
  const pending = queue.nextDue(10);
  assert.equal(queue.cancel(pending.id), true);
  assert.equal(queue.cancel(pending.id), false);
  const sending = queue.claim(queue.nextDue(10).id, 10);
  assert.equal(queue.recoverInterrupted(20), 1);
  const retried = queue.claim(sending.id, 20);
  assert.equal(retried.attempt_count, 2);
  assert.match(retried.last_error, /interrupted/);
  assert.equal(queue.finish(retried, { status: 'failed', lastError: 'Rejected' }), true);
});
