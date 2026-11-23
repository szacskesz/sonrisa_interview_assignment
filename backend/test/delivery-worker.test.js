import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateDatabase, openDatabase } from '../src/database.js';
import { createDeliveryQueue } from '../src/delivery-jobs.js';
import { createDeliveryWorker } from '../src/delivery-worker.js';
import { createFeedStore, defaultFixtureUrl } from '../src/feeds.js';
import { createMatcher } from '../src/matching.js';
import { createSubscriptionStore } from '../src/subscriptions.js';

const destination = 'reader@example.test';

function setup(database, channel, maxAttempts) {
  migrateDatabase(database);
  database.exec(`INSERT INTO users (id, email, password_hash, role, created_at_ms) VALUES (1, '${destination}', 'hash', 'user', 0)`);
  let time = 1;
  const now = () => time;
  const subscriptions = createSubscriptionStore(database, { now });
  const subscription = subscriptions.create(1, 'World');
  const feed = createFeedStore(database).create({ url: defaultFixtureUrl, topic: 'World', publisher: 'Demo' });
  const queue = createDeliveryQueue(database);
  const matcher = createMatcher(database);
  const worker = createDeliveryWorker({
    queue, channels: new Map([['email', channel]]), maxAttempts, now,
    isEligible: (job) => matcher.isEligible(job.topic, job.published_at_ms, job.channel, job.destination),
  });
  return {
    queue, worker, subscriptions, subscription,
    advanceTo: (timestamp) => { time = timestamp; },
    enqueue(itemId = 'first') {
      queue.enqueue({ feedId: feed.id, sourceUrl: feed.url, itemId, channel: 'email',
        destination, title: 'Headline', topic: 'World', publisher: 'Demo', publishedAt: 2 }, now());
    },
    jobs: () => database.prepare('SELECT * FROM delivery_jobs ORDER BY id').all(),
  };
}

test('retries a temporary failure when due, sends once, and never claims an already-sent job', async () => {
  using database = openDatabase(':memory:');
  let count = 0;
  const demo = setup(database, { async send(address, message) {
    assert.equal(address, destination);
    assert.equal(message.title, 'Headline');
    count += 1;
    return count === 1 ? { status: 'retryable', error: 'Temporary failure' } : { status: 'sent' };
  } });
  demo.enqueue();
  await Promise.all([demo.worker.tick(), demo.worker.tick()]);
  const [pending] = demo.jobs();
  assert.deepEqual([pending.status, pending.attempt_count, pending.next_attempt_at_ms, pending.last_error],
    ['pending', 1, 5_001, 'Temporary failure']);
  demo.advanceTo(5_000);
  await demo.worker.tick();
  assert.equal(count, 1);
  demo.advanceTo(5_001);
  await demo.worker.tick();
  await demo.worker.tick();
  const [sent] = demo.jobs();
  assert.deepEqual([sent.status, sent.attempt_count, sent.sent_at_ms, sent.last_error], ['sent', 2, 5_001, null]);
  assert.equal(count, 2);
});

test('cancels a retry if the subscription was paused and resumed after publication', async () => {
  using database = openDatabase(':memory:');
  const demo = setup(database, { async send() { throw new Error('Temporary failure'); } });
  demo.enqueue();
  await demo.worker.tick();
  demo.advanceTo(5_001);
  demo.subscriptions.update(1, demo.subscription.id, { status: 'paused' });
  demo.subscriptions.update(1, demo.subscription.id, { status: 'active' });
  await demo.worker.tick();
  assert.deepEqual(demo.jobs().map(({ status, attempt_count }) => [status, attempt_count]), [['canceled', 1]]);
});

test('finishes permanent and exhausted interrupted attempts without retrying', async () => {
  using database = openDatabase(':memory:');
  const demo = setup(database, { async send() { return { status: 'permanent', error: 'Rejected' }; } }, 1);
  demo.enqueue('permanent');
  await demo.worker.tick();
  demo.enqueue('interrupted');
  demo.queue.claim(demo.jobs()[1].id, 1);
  assert.equal(demo.worker.recover(), 1);
  await demo.worker.tick();
  assert.deepEqual(demo.jobs().map(({ status, attempt_count, last_error }) => [status, attempt_count, last_error]),
    [['failed', 1, 'Rejected'], ['failed', 1, 'Previous delivery attempt was interrupted']]);
});
