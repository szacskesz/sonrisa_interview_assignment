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
import { createFixtureRssSource } from '../src/rss-source.js';

const anchor = Date.parse('2026-11-23T09:02:00.000Z');

function setup(database, options = {}) {
  migrateDatabase(database);
  const now = options.now ?? (() => anchor);
  const feeds = createFeedStore(database, { now });
  const matcher = createMatcher(database);
  const queue = createDeliveryQueue(database);
  const sourceFor = options.sourceFor ?? ((feed) => createFixtureRssSource(feed.url));
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
    const { feeds, poll } = setup(database);
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
    const { feeds, poll } = setup(database);
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
  const { feeds, poll } = setup(database, { sourceFor: () => ({
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

test('imports newly visible public RSS items with tied and unordered dates, and skips historical or unchanged items', async () => {
  using database = openDatabase(':memory:');
  const url = 'https://example.test/rss?region=HU';
  let time = anchor;
  const item = (id, publishedAt) => ({ id, title: id, publishedAt });
  const history = item('history', anchor - 1_000);
  const future = item('future', anchor + 30_000);
  let items = [history, item('old undated', null), future];
  const options = { now: () => time, sourceFor: () => ({ snapshot: async () => items }) };
  const { feeds, poll } = setup(database, options);
  const { id } = feeds.create(config(url));
  database.exec(`
    INSERT INTO users VALUES (1, 'reader@example.test', 'hash', 'user', 0);
    INSERT INTO subscriptions VALUES (1, 1, 'World', 'active', 0, 0);
  `);
  await poll(id);
  assert.deepEqual(jobs(database), []);
  const first = item('first', anchor + 20_000);
  const sameTime = item('same time', anchor + 20_000);
  const undated = item('new undated', null);
  time += 40_000;
  items = [future, first, history, sameTime, undated, item('stale discovery', anchor - 500)];
  await poll(id);
  await poll(id);
  items = [];
  await poll(id);
  items = [sameTime, first, future, undated, item('later discovery', anchor + 15_000)];
  await poll(id);
  const sent = database.prepare('SELECT title, published_at_ms FROM delivery_jobs ORDER BY id').all();
  assert.deepEqual(sent.map(({ title, published_at_ms }) => [title, published_at_ms]), [
    ['future', future.publishedAt], ['first', first.publishedAt], ['same time', sameTime.publishedAt],
    ['new undated', time], ['later discovery', anchor + 15_000],
  ]);
  assert.equal(JSON.parse(feeds.get(id).rss_snapshot_ids).length, items.length);
});
