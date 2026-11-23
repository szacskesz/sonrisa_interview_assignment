import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateDatabase, openDatabase } from '../src/database.js';
import { createFeedStore, defaultFixtureUrl } from '../src/feeds.js';

const backup = 'http://127.0.0.1:18081/rss.xml';
const settings = { url: defaultFixtureUrl, publisher: ' Demo ', topic: ' World ' };

test('creates normalized settings and rejects duplicate, malformed and untrusted URLs', () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  const feeds = createFeedStore(database, { now: () => 50 });
  const feed = feeds.create({ ...settings, url: 'HTTP://127.0.0.1:18080/rss.xml' });
  assert.deepEqual([feed.url, feed.publisher, feed.topic, feed.enabled, feed.poll_interval_seconds, feed.next_poll_at_ms],
    [defaultFixtureUrl, 'Demo', 'World', 1, 300, 50]);
  assert.deepEqual(feeds.list(), [feed]);
  assert.throws(() => feeds.create(settings), { code: 'duplicate_feed_url' });
  assert.throws(() => feeds.create({ ...settings, url: backup }), { code: 'untrusted_feed_url' });
  assert.throws(() => feeds.create({ ...settings, url: defaultFixtureUrl + '?page=2' }), { code: 'invalid_feed_url' });
  assert.throws(() => feeds.update(feed.id, { pollIntervalSeconds: 0 }), { code: 'invalid_feed_settings' });
  assert.equal(feeds.update(-1, {}), undefined);
});

test('retains progress for interval edits and resets it on re-enable or URL replacement', () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  const feeds = createFeedStore(database, { trustedUrls: [defaultFixtureUrl, backup], now: () => 1_000 });
  const { id } = feeds.create(settings);
  const setCheckpoint = database.prepare('UPDATE feeds SET initialized_at_ms = 20, last_processed_published_at_ms = 10 WHERE id = ?');
  setCheckpoint.run(id);
  const rescheduled = feeds.update(id, { pollIntervalSeconds: 60 });
  assert.equal(rescheduled.next_poll_at_ms, 61_000);
  assert.equal(rescheduled.last_processed_published_at_ms, 10);
  assert.equal(feeds.revision(id), 0);
  assert.equal(feeds.update(id, { enabled: false }).enabled, 0);
  assert.equal(feeds.revision(id), 1);
  const enabled = feeds.update(id, { enabled: true });
  assert.equal(enabled.initialized_at_ms, null);
  assert.equal(enabled.last_processed_published_at_ms, null);
  assert.equal(enabled.next_poll_at_ms, 1_000);
  assert.equal(feeds.revision(id), 2);
  setCheckpoint.run(id);
  assert.equal(feeds.update(id, { url: backup }).last_processed_published_at_ms, null);
  assert.equal(feeds.revision(id), 3);
});
