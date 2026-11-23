import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { minute, startFakeFeed } from '../fixtures/fake-rss.js';
import { migrateDatabase, openDatabase } from '../src/database.js';
import { createDeliveryQueue } from '../src/delivery-jobs.js';
import { createFeedPoller } from '../src/feed-polling.js';
import { createFeedStore, defaultFixtureUrl } from '../src/feeds.js';
import { createMatcher } from '../src/matching.js';
import { createRssSource } from '../src/rss-source.js';

const anchor = Date.parse('2026-11-23T09:02:00.000Z');

function setup(database, url, options = {}) {
  migrateDatabase(database);
  const now = options.now ?? (() => anchor);
  const feeds = createFeedStore(database, { trustedUrls: [url], now });
  const matcher = createMatcher(database);
  const queue = createDeliveryQueue(database);
  const sourceFor = options.sourceFor ?? ((feed) => createRssSource(feed.url));
  return { feeds, poll: createFeedPoller({ database, feeds, matcher, queue, sourceFor, now }) };
}

const config = (url) => ({ url, publisher: 'Fixture', topic: 'World' });
const jobs = (database) => database.prepare('SELECT destination, published_at_ms FROM delivery_jobs ORDER BY id').all();

test('resumes missed pages from the last committed checkpoint after rollback and restart', async (t) => {
  let now = anchor;
  const fixture = await startFakeFeed({ pageSize: 2, now: () => now });
  t.after(fixture.close);
  const directory = await mkdtemp(join(tmpdir(), 'alerts-replay-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'alerts.sqlite');
  let id;
  {
    using database = openDatabase(path);
    const { feeds, poll } = setup(database, fixture.url);
    id = feeds.create(config(fixture.url)).id;
    database.exec(`
      INSERT INTO users VALUES (1, 'reader@example.test', 'hash', 'user', 0);
      INSERT INTO subscriptions VALUES (1, 1, 'World', 'active', 0, 0), (2, 1, 'World', 'active', 0, 0);
    `);
    assert.equal(await poll(id), true);
    assert.deepEqual(jobs(database), []);
    now += 6 * minute;
    database.exec(`CREATE TRIGGER reject_batch BEFORE INSERT ON delivery_jobs
      WHEN NEW.published_at_ms = ${anchor + 4 * minute}
      BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;`);
    await assert.rejects(poll(id), /fixture failure/);
    assert.equal(feeds.get(id).last_processed_published_at_ms, anchor + 2 * minute);
    assert.equal(jobs(database).length, 2);
  }
  {
    using database = openDatabase(path);
    const { feeds, poll } = setup(database, fixture.url);
    database.exec(`
      DROP TRIGGER reject_batch;
      INSERT INTO users VALUES (2, 'late@example.test', 'hash', 'user', 0);
      INSERT INTO subscriptions VALUES (3, 2, 'World', 'active', 0, ${anchor + 4 * minute});
    `);
    await poll(id);
    await poll(id);
    assert.equal(feeds.get(id).last_processed_published_at_ms, now);
    const allJobs = jobs(database);
    assert.deepEqual(allJobs.filter((job) => job.destination === 'reader@example.test').map((job) => job.published_at_ms),
      [1, 2, 3, 4, 5, 6].map((index) => anchor + index * minute));
    assert.deepEqual(allJobs.filter((job) => job.destination === 'late@example.test').map((job) => job.published_at_ms),
      [5, 6].map((index) => anchor + index * minute));
  }
});

test('records a clean empty baseline, then imports articles published afterwards', async () => {
  using database = openDatabase(':memory:');
  let through = null;
  const { feeds, poll } = setup(database, defaultFixtureUrl, { sourceFor: () => ({
    latest: async () => through,
    page: async (after, upper) => {
      assert.equal(after, anchor);
      return [{ id: 'new', title: 'New', publishedAt: upper }];
    },
  }) });
  const { id } = feeds.create(config(defaultFixtureUrl));
  database.exec(`
    INSERT INTO users VALUES (1, 'reader@example.test', 'hash', 'user', 0);
    INSERT INTO subscriptions VALUES (1, 1, 'World', 'active', 0, 0);
  `);
  await poll(id);
  assert.equal(feeds.get(id).initialized_at_ms, anchor);
  assert.equal(feeds.get(id).last_processed_published_at_ms, null);
  through = anchor + minute;
  await poll(id);
  assert.equal(jobs(database)[0].published_at_ms, through);
});
