import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSlackChannel } from '../src/slack-channel.js';

const config = { botToken: 'test-bot-token', workspaceId: 'T123' };
const destination = 'T123:U123';
const alert = { title: '<!channel> Storm & rain', topic: 'Weather', publisher: 'Forecast',
  url: 'https://example.test/alert?a=1&b=2', occurredAt: 0 };

test('uses the installed bot, validates DM routing, and posts plain text without previews', async () => {
  const calls = [];
  const channel = createSlackChannel(config, { fetchRequest: async (url, options) => {
    const name = new URL(url).pathname.split('/').at(-1);
    assert.equal(options.headers.Authorization, 'Bearer test-bot-token');
    calls.push([name, JSON.parse(options.body)]);
    if (name === 'auth.test') return Response.json({ ok: true, team_id: 'T123', bot_id: 'B123' });
    if (name === 'conversations.open') return Response.json({ ok: true, channel: { id: 'D123' } });
    return Response.json({ ok: true });
  } });
  assert.deepEqual(await channel.send(destination, alert), { status: 'sent' });
  assert.deepEqual(calls, [
    ['auth.test', {}], ['conversations.open', { users: 'U123' }],
    ['chat.postMessage', { channel: 'D123', mrkdwn: false, link_names: false, unfurl_links: false, unfurl_media: false,
      text: '&lt;!channel&gt; Storm &amp; rain\nTopic: Weather\nSource: Forecast\nOccurred (UTC): 1970-01-01T00:00:00.000Z\nhttps://example.test/alert?a=1&amp;b=2' }],
  ]);
  assert.equal((await channel.send('T999:U123', alert)).status, 'permanent');
  let current = true;
  assert.deepEqual(await channel.send(destination, alert, () => {
    const result = current;
    current = false;
    return result;
  }), { status: 'canceled' });
  assert.deepEqual(calls.slice(3), [['conversations.open', { users: 'U123' }]]);
});

test('honors rate limits and handles safe permanent and temporary failure outcomes', async () => {
  let time = 10;
  let calls = 0;
  const responses = [
    Response.json({ ok: true, team_id: 'T123', bot_id: 'B123' }),
    new Response('', { status: 429, headers: { 'Retry-After': '75' } }),
    new Response('', { status: 503 }),
    Response.json({ ok: false, error: 'ratelimited' }, { headers: { 'Retry-After': '7' } }),
    Response.json({ ok: false, error: 'missing_scope', secret: config.botToken }),
  ];
  const channel = createSlackChannel(config, { now: () => time, fetchRequest: async () => {
    calls += 1;
    return responses.shift();
  } });
  assert.deepEqual(await channel.send(destination, alert), { status: 'retryable', error: 'Slack rate limit', retryAt: 75_010 });
  assert.equal(channel.availableAt(), 75_010);
  assert.equal((await channel.send(destination, alert)).retryAt, 75_010);
  assert.equal(calls, 2);
  time = 75_010;
  assert.equal((await channel.send(destination, alert)).status, 'retryable');
  assert.equal((await channel.send(destination, alert)).retryAt, 82_010);
  time = 82_010;
  assert.deepEqual(await channel.send(destination, alert), { status: 'permanent', error: 'Slack rejected the request (missing_scope)' });
});

test('rejects the entire send when the bot workspace differs', async () => {
  const channel = createSlackChannel(config, { fetchRequest: async (url) => {
    assert.match(url, /auth\.test$/);
    return Response.json({ ok: true, team_id: 'T999', bot_id: 'B123' });
  } });
  assert.equal((await channel.send(destination, alert)).status, 'permanent');
});
