import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { migrateDatabase, openDatabase, transaction } from '../src/database.js';

test('opens the configured file and closes the connection with the API', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'alerts-db-'));
  try {
    const path = join(directory, 'data', 'alerts.sqlite');
    const app = createApp({ databasePath: path });
    app.database.exec('CREATE TABLE example (id INTEGER PRIMARY KEY)');
    await app.close();
    assert.throws(() => app.database.exec('SELECT 1'), /not open/i);
    using database = openDatabase(path);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM example').get().count, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('enforces foreign keys', () => {
  using database = openDatabase(':memory:');
  database.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id REFERENCES parent(id));');
  assert.throws(() => database.exec('INSERT INTO child VALUES (1)'), /FOREIGN KEY constraint failed/);
});

test('migrates all four tables on startup and can rerun without losing rows', async (t) => {
  const app = createApp();
  t.after(() => app.close());
  await app.ready();
  const database = app.database;
  const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all();
  assert.deepEqual(tables.map(({ name }) => name), ['delivery_jobs', 'feeds', 'subscriptions', 'users']);
  database.exec("INSERT INTO users VALUES (1, 'test@example.test', 'hash', 'user', 0)");
  migrateDatabase(database);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(database.prepare('SELECT email FROM users').get().email, 'test@example.test');
});

test('upgrades an existing fixture without resetting its checkpoint', () => {
  using database = openDatabase(':memory:');
  database.exec(readFileSync(new URL('../src/migrations/001-initial.sql', import.meta.url), 'utf8'));
  database.exec(`
    PRAGMA user_version = 1;
    INSERT INTO feeds (url, publisher, topic, poll_interval_seconds, next_poll_at_ms, initialized_at_ms, last_processed_published_at_ms)
    VALUES ('http://127.0.0.1:18080/rss.xml', 'Fixture', 'World', 60, 100, 20, 15);
  `);
  migrateDatabase(database);
  assert.deepEqual({ ...database.prepare('SELECT last_processed_published_at_ms, rss_snapshot_ids FROM feeds').get() },
    { last_processed_published_at_ms: 15, rss_snapshot_ids: null });
});

test('rolls back a failed migration and refuses a newer database', () => {
  using database = openDatabase(':memory:');
  database.exec('CREATE TABLE subscriptions (id INTEGER PRIMARY KEY)');
  assert.throws(() => migrateDatabase(database), /already exists/);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(database.prepare("SELECT name FROM sqlite_schema WHERE name = 'users'").get(), undefined);
  database.exec('PRAGMA user_version = 10');
  assert.throws(() => migrateDatabase(database), /Unsupported database schema version 10/);
});

test('preserves the original error when SQLite already rolled back the transaction', () => {
  using database = openDatabase(':memory:');
  database.exec('CREATE TABLE example (id INTEGER PRIMARY KEY)');
  assert.throws(() => transaction(database, () => {
    database.exec('INSERT INTO example VALUES (1); INSERT OR ROLLBACK INTO example VALUES (1)');
  }), /UNIQUE constraint failed/);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM example').get().count, 0);
});
