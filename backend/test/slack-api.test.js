import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiFixture, origin } from '../test-support/api.js';

test('requires the initiating browser and account to confirm a single-use Slack link', async (t) => {
  let timestamp = 1;
  const connection = { workspaceId: 'T123', memberId: 'U123' };
  const identity = {
    authorize: (state, nonce) => `https://slack.com/?state=${state}&nonce=${nonce}`,
    exchange: async (code, nonce) => {
      assert.equal(code, 'verified');
      assert.equal(nonce.length, 43);
      return connection;
    },
  };
  const { app, request } = await createApiFixture(t, { slackIdentity: identity, now: () => timestamp });
  const send = (method, url, cookie, userId) => app.inject({
    method, url, headers: { origin, cookie: [
      cookie, userId && `alerts_session=${app.jwt.sign({ sub: String(userId) })}`,
    ].filter(Boolean).join('; ') },
  });
  const start = async (id) => {
    const response = await request(id, 'POST', '/api/slack/start');
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
    const cookie = response.headers['set-cookie'].split(';')[0];
    const { searchParams } = new URL(response.json().authorizeUrl);
    return { cookie, callback: `/api/slack/callback?code=verified&state=${searchParams.get('state')}` };
  };
  assert.equal((await request(null, 'POST', '/api/slack/start')).statusCode, 401);
  const { cookie, callback } = await start(2);
  assert.equal((await send('GET', callback)).headers.location, '/subscriptions?slack=failed');
  assert.equal((await send('GET', callback, cookie)).headers.location, '/subscriptions?slack=confirm');
  assert.equal((await send('GET', callback, cookie)).headers.location, '/subscriptions?slack=failed');
  assert.equal((await request(2, 'GET', '/api/slack')).json().connection, null);
  assert.equal((await send('POST', '/api/slack/confirm', cookie, 3)).statusCode, 400);
  assert.deepEqual((await send('POST', '/api/slack/confirm', cookie, 2)).json(), { available: true, connection });
  assert.equal((await send('POST', '/api/slack/confirm', cookie, 2)).statusCode, 400);

  const duplicate = await start(3);
  await send('GET', duplicate.callback, duplicate.cookie);
  assert.equal((await send('POST', '/api/slack/confirm', duplicate.cookie, 3)).statusCode, 409);
  const expired = await start(2);
  timestamp += 300_000;
  assert.equal((await send('GET', expired.callback, expired.cookie)).headers.location, '/subscriptions?slack=failed');
  const abandoned = await start(2);
  await send('GET', abandoned.callback, abandoned.cookie);
  assert.equal((await request(2, 'DELETE', '/api/slack')).statusCode, 204);
  assert.equal((await send('POST', '/api/slack/confirm', abandoned.cookie, 2)).statusCode, 400);
  assert.equal((await request(2, 'GET', '/api/slack')).json().connection, null);
});

test('shows Slack as unavailable without credentials', async (t) => {
  const { request } = await createApiFixture(t);
  assert.deepEqual((await request(2, 'GET', '/api/slack')).json(), { available: false, connection: null });
  assert.equal((await request(2, 'POST', '/api/slack/start')).statusCode, 503);
});
