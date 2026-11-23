import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Open an application SQLite file or an isolated :memory: database. */
export function openDatabase(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5_000 });
}
