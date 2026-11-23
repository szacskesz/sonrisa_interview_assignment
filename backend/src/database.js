import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Open an application SQLite file or an isolated :memory: database. */
export function openDatabase(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5_000 });
}

/** Run a synchronous unit of work atomically on this connection. */
export function transaction(database, work) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

const migrations = [new URL('./migrations/001-initial.sql', import.meta.url)];

/** Apply committed migrations in order while preserving existing application data. */
export function migrateDatabase(database) {
  transaction(database, () => {
    const { user_version: version } = database.prepare('PRAGMA user_version').get();
    if (version > migrations.length || version < 0) {
      throw new Error(`Unsupported database schema version ${version}`);
    }
    for (let index = version; index < migrations.length; index += 1) {
      database.exec(readFileSync(migrations[index], 'utf8'));
      database.exec(`PRAGMA user_version = ${index + 1}`);
    }
  });
}
