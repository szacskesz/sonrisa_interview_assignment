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
  const emails = (topic, at) => matching.recipients(topic, at).map(({ destination }) => destination);
  assert.deepEqual(emails('World', 20), ['one@example.test']);
  assert.deepEqual(emails('World', 21), ['one@example.test', 'three@example.test']);
  subscriptions.update(1, first.id, { status: 'paused' });
  assert.equal(matching.isEligible('World', 21, 'email', 'one@example.test'), true);
  subscriptions.remove(1, overlapping.id);
  assert.equal(matching.isEligible('World', 21, 'email', 'one@example.test'), false);
  now = 30;
  subscriptions.update(3, recent.id, { topic: 'Markets' });
  assert.deepEqual(emails('Markets', 30), ['two@example.test']);
  assert.deepEqual(emails('Markets', 31), ['three@example.test', 'two@example.test']);
});

test('matches channels independently and rechecks the current Slack identity and activation', () => {
  using database = openDatabase(':memory:');
  migrateDatabase(database);
  database.exec(`
    INSERT INTO users (id, email, password_hash, role, created_at_ms) VALUES
      (1, 'one@example.test', 'hash', 'user', 0), (2, 'two@example.test', 'hash', 'user', 0);
    UPDATE users SET slack_workspace_id = 'T123', slack_member_id = 'U123', slack_connected_at_ms = 12 WHERE id = 1;
    UPDATE users SET slack_workspace_id = 'T999', slack_member_id = 'U234', slack_connected_at_ms = 12 WHERE id = 2;
  `);
  let now = 10;
  const subscriptions = createSubscriptionStore(database, { now: () => now });
  const first = subscriptions.create(1, 'World');
  subscriptions.create(2, 'World', ['slack']);
  now = 20;
  subscriptions.update(1, first.id, { channels: ['email', 'slack'] });
  subscriptions.create(1, 'World', ['slack']);
  const matcher = createMatcher(database, { slackWorkspaceId: 'T123' });
  const results = (at) => matcher.recipients('World', at).map(({ channel, destination }) => [channel, destination]);
  assert.deepEqual(results(20), [['email', 'one@example.test']]);
  assert.deepEqual(results(21), [['email', 'one@example.test'], ['slack', 'T123:U123']]);
  database.exec('UPDATE users SET slack_connected_at_ms = 25 WHERE id = 1');
  assert.equal(matcher.isEligible('World', 25, 'slack', 'T123:U123'), false);
  assert.equal(matcher.isEligible('World', 26, 'slack', 'T123:U123'), true);
  database.exec('UPDATE users SET slack_workspace_id = NULL, slack_member_id = NULL, slack_connected_at_ms = NULL WHERE id = 1');
  assert.equal(matcher.isEligible('World', 26, 'slack', 'T123:U123'), false);
  assert.deepEqual(results(26), [['email', 'one@example.test']]);
});
