import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateDatabase, openDatabase } from '../src/database.js';
import { createMatcher } from '../src/matching.js';
import { createSubscriptionStore } from '../src/subscriptions.js';

test('matches a topic across feeds with strict activation and one result per account email', () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  database.exec(`
    INSERT INTO users (id, email, password_hash, role, created_at_ms) VALUES
      (1, 'one@example.test', 'hash', 'user', 0),
      (2, 'two@example.test', 'hash', 'user', 0),
      (3, 'three@example.test', 'hash', 'user', 0);
  `);
  let now = 10;
  const subscriptions = createSubscriptionStore(database, { now: () => now });
  const first = subscriptions.create(1, 'World');
  const overlapping = subscriptions.create(1, 'World');
  subscriptions.create(2, 'Markets');
  now = 20;
  const recent = subscriptions.create(3, 'World');
  const matching = createMatcher(database);
  assert.deepEqual(matching.recipients('World', 10), []);
  assert.deepEqual(matching.recipients('World', 20), ['one@example.test']);
  assert.deepEqual(matching.recipients('World', 21), ['one@example.test', 'three@example.test']);
  subscriptions.update(1, first.id, { status: 'paused' });
  assert.equal(matching.isEligible('World', 21, 'one@example.test'), true);
  subscriptions.remove(1, overlapping.id);
  assert.equal(matching.isEligible('World', 21, 'one@example.test'), false);
  now = 30;
  subscriptions.update(3, recent.id, { topic: 'Markets' });
  assert.deepEqual(matching.recipients('Markets', 30), ['two@example.test']);
  assert.deepEqual(matching.recipients('Markets', 31), ['three@example.test', 'two@example.test']);
});
