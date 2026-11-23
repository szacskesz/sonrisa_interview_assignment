import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateDatabase, openDatabase } from '../src/database.js';
import { createSubscriptionStore } from '../src/subscriptions.js';

test('stores subscription changes, retaining activation for a pause and resetting it for resume or topic edits', () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  database.exec("INSERT INTO users VALUES (1, 'one@example.test', 'hash', 'user', 0)");
  let now = 100;
  const subscriptions = createSubscriptionStore(database, { now: () => now });
  const created = subscriptions.create(1, 'World');
  const { id } = created;
  assert.deepEqual([created.status, created.created_at_ms, created.activated_at_ms], ['active', 100, 100]);
  now = 200;
  const paused = subscriptions.update(1, id, { status: 'paused' });
  assert.deepEqual([paused.status, paused.activated_at_ms], ['paused', 100]);
  const resumed = subscriptions.update(1, id, { status: 'active' });
  assert.deepEqual([resumed.status, resumed.activated_at_ms], ['active', 200]);
  now = 300;
  assert.equal(subscriptions.update(1, id, { status: 'active' }).activated_at_ms, 200);
  const edited = subscriptions.update(1, id, { topic: 'Markets' });
  assert.deepEqual([edited.topic, edited.activated_at_ms], ['Markets', 300]);
  assert.deepEqual(subscriptions.list(1), [edited]);
  assert.equal(subscriptions.remove(1, id), true);
  assert.deepEqual(subscriptions.list(1), []);
});

test('cannot read, change, or remove another account subscription', () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  database.exec("INSERT INTO users VALUES (1, 'one@example.test', 'hash', 'user', 0)");
  const subscriptions = createSubscriptionStore(database);
  const { id } = subscriptions.create(1, 'World');
  assert.equal(subscriptions.get(2, id), undefined);
  assert.equal(subscriptions.update(2, id, { status: 'paused' }), undefined);
  assert.equal(subscriptions.remove(2, id), false);
  assert.equal(subscriptions.get(1, id).status, 'active');
});
