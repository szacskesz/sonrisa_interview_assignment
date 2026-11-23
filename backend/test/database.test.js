import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { migrateDatabase, openDatabase } from '../src/database.js';

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
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(database.prepare('SELECT email FROM users').get().email, 'test@example.test');
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
