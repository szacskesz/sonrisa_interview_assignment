import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { defaultFixtureUrl } from '../src/feeds.js';

const backup = 'http://127.0.0.1:18081/rss.xml';
const settings = { url: defaultFixtureUrl, publisher: 'Demo', topic: 'World', pollIntervalSeconds: 60 };

test('shares one cycle per due feed and persists failure backoff and next due time', async (t) => {
  let now = 0;
  let calls = 0;
  const app = createApp({
    now: () => now,
    sourceFor: () => ({ latest: async () => {
      calls += 1;
      if (calls < 3) throw new Error('Feed unavailable');
      return 0;
    } }),
  });
  t.after(() => app.close());
  await app.ready();
  const { feeds, pollFeeds } = app.services;
  const { id } = feeds.create(settings);
  await Promise.all([pollFeeds(), pollFeeds()]);
  assert.equal(calls, 1);
  assert.equal(feeds.get(id).last_poll_error, 'Feed unavailable');
  assert.equal(feeds.get(id).next_poll_at_ms, 5_000);
  now = 4_999;
  await pollFeeds();
  assert.equal(calls, 1);
  now = 5_000;
  await pollFeeds();
  assert.equal(feeds.get(id).last_poll_attempt_at_ms, now);
  assert.equal(feeds.get(id).next_poll_at_ms, 15_000);
  now = 15_000;
  await pollFeeds();
  assert.equal(feeds.get(id).last_poll_success_at_ms, now);
  assert.equal(feeds.get(id).last_poll_error, null);
  assert.equal(feeds.get(id).next_poll_at_ms, 75_000);
});

test('discards in-flight data after disable and re-enable or an RSS URL replacement', async (t) => {
  let snapshot = Promise.withResolvers();
  const app = createApp({
    now: () => 30,
    sourceFor: () => ({ latest: () => snapshot.promise }),
  });
  t.after(() => app.close());
  await app.ready();
  const { feeds, pollFeeds } = app.services;
  const { id } = feeds.create(settings);
  const first = pollFeeds();
  feeds.update(id, { enabled: false });
  feeds.update(id, { enabled: true });
  snapshot.resolve(10);
  await first;
  assert.equal(feeds.get(id).initialized_at_ms, null);
  assert.equal(feeds.get(id).last_poll_success_at_ms, null);

  snapshot = Promise.withResolvers();
  const second = pollFeeds();
  feeds.update(id, { url: backup });
  snapshot.resolve(20);
  await second;
  assert.equal(feeds.get(id).initialized_at_ms, null);
  await pollFeeds();
  assert.equal(feeds.get(id).last_processed_published_at_ms, 20);
  assert.equal(feeds.get(id).last_poll_success_at_ms, 30);
  assert.equal(app.database.prepare('SELECT COUNT(*) AS count FROM delivery_jobs').get().count, 0);
});

test('preserves an interval edit made during a poll', async (t) => {
  const snapshot = Promise.withResolvers();
  let now = 5_000;
  const app = createApp({ now: () => now, sourceFor: () => ({ latest: () => snapshot.promise }) });
  t.after(() => app.close());
  await app.ready();
  const { feeds, pollFeeds } = app.services;
  const { id } = feeds.create(settings);
  const running = pollFeeds();
  now = 8_000;
  feeds.update(id, { pollIntervalSeconds: 120 });
  snapshot.resolve(0);
  await running;
  assert.equal(feeds.get(id).next_poll_at_ms, 128_000);
  assert.equal(feeds.get(id).last_processed_published_at_ms, 0);
});
