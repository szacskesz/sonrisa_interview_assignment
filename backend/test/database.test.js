import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';

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
