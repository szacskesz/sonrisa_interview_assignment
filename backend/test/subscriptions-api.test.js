import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFixtureUrl } from '../src/feeds.js';
import { createApiFixture } from '../test-support/api.js';

test('creates, edits, pauses, resumes and removes subscriptions for the signed-in owner', async (t) => {
  let time = 100;
  const markets = 'http://127.0.0.1:18081/rss.xml';
  const { app, request } = await createApiFixture(t, { now: () => time });
  const feeds = app.services.feeds;
  feeds.create({ url: defaultFixtureUrl, publisher: 'Fixture', topic: 'World' });
  const alternate = feeds.create({ url: markets, publisher: 'Fixture', topic: 'Markets' });
  const path = '/api/subscriptions';
  assert.equal((await request(null, 'GET', path)).statusCode, 401);
  assert.equal((await request(2, 'POST', path, { topic: 'Unknown' })).json().code, 'topic_unavailable');
  assert.equal((await request(2, 'POST', path, { topic: 'World', destination: 'other@example.test' })).statusCode, 400);
  const created = await request(2, 'POST', path, { topic: 'World' });
  assert.equal(created.statusCode, 201);
  const row = created.json();
  assert.deepEqual(row, { id: 1, topic: 'World', status: 'active', channels: ['email'],
    destination: 'reader@example.test', createdAt: 100, activatedAt: 100 });
  assert.deepEqual((await request(2, 'GET', path)).json(), { subscriptions: [row] });
  assert.deepEqual((await request(3, 'GET', path)).json(), { subscriptions: [] });
  const item = `${path}/${row.id}`;
  assert.equal((await request(3, 'PATCH', item, { status: 'paused' })).statusCode, 404);
  assert.equal((await request(3, 'DELETE', item)).statusCode, 404);
  assert.equal((await request(2, 'PATCH', item, { status: 'unknown' })).statusCode, 400);
  time = 200;
  const updated = await request(2, 'PATCH', item, { topic: 'Markets' });
  assert.equal(updated.json().activatedAt, 200);
  feeds.update(alternate.id, { enabled: false });
  assert.equal((await request(2, 'GET', path)).json().subscriptions[0].topic, 'Markets');
  assert.equal((await request(2, 'PATCH', item, { status: 'paused' })).json().activatedAt, 200);
  time = 300;
  assert.equal((await request(2, 'PATCH', item, { status: 'active' })).json().activatedAt, 300);
  assert.equal((await request(2, 'DELETE', item)).statusCode, 204);
  assert.equal((await request(2, 'DELETE', item)).statusCode, 404);
});

test('validates new delivery choices and preserves existing channel activation and disconnected preferences', async (t) => {
  let time = 10;
  const { app, request } = await createApiFixture(t, { now: () => time, slackIdentity: { workspaceId: 'T123' } });
  app.services.feeds.create({ url: defaultFixtureUrl, publisher: 'Fixture', topic: 'World' });
  const path = '/api/subscriptions';
  for (const channels of [[], ['email', 'email'], ['sms'], 'email']) {
    assert.equal((await request(2, 'POST', path, { topic: 'World', channels })).statusCode, 400);
  }
  assert.equal((await request(2, 'POST', path, { topic: 'World', channels: ['slack'] })).json().code, 'slack_connection_required');
  const created = (await request(2, 'POST', path, { topic: 'World' })).json();
  app.database.exec("UPDATE users SET slack_workspace_id = 'T123', slack_member_id = 'U123', slack_connected_at_ms = 15 WHERE id = 2");
  time = 20;
  const item = `${path}/${created.id}`;
  assert.deepEqual((await request(2, 'PATCH', item, { channels: ['slack', 'email'] })).json().channels, ['email', 'slack']);
  assert.deepEqual(app.database.prepare('SELECT activated_at_ms FROM subscription_channels ORDER BY channel').all()
    .map((row) => row.activated_at_ms), [10, 20]);
  await request(2, 'DELETE', '/api/slack');
  assert.deepEqual((await request(2, 'PATCH', item, { status: 'paused' })).json().channels, ['email', 'slack']);
  assert.deepEqual((await request(2, 'PATCH', item, { channels: ['email'] })).json().channels, ['email']);
  assert.equal((await request(2, 'PATCH', item, { channels: ['slack'] })).json().code, 'slack_connection_required');
});
