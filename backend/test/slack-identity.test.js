import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { createSlackIdentity, slackConfiguration } from '../src/slack-identity.js';

test('validates Slack signature and claims before returning only the workspace and member', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const config = { clientId: 'client', clientSecret: 'secret', workspaceId: 'T123',
    redirectUrl: 'https://alerts.example.test/api/slack/callback' };
  const issuer = 'https://slack.com';
  let idToken;
  const client = createSlackIdentity(config, {
    keys: async () => publicKey,
    fetchRequest: async (url, { body, redirect }) => {
      assert.equal(url, `${issuer}/api/openid.connect.token`);
      assert.equal(redirect, 'error');
      assert.equal(body.get('code'), 'code');
      assert.equal(body.get('redirect_uri'), config.redirectUrl);
      return Response.json({ ok: true, access_token: 'discard', id_token: idToken });
    },
  });
  const authorize = new URL(client.authorize('state', 'nonce'));
  assert.equal(authorize.searchParams.get('response_mode'), 'query');
  assert.equal(authorize.searchParams.get('scope'), 'openid profile');
  const token = (claims = {}, key = privateKey) => new SignJWT({
    iss: issuer, aud: config.clientId, sub: 'U123', nonce: 'nonce',
    ['https://slack.com/team_id']: 'T123', ['https://slack.com/user_id']: 'U123',
    exp: Math.floor(Date.now() / 1000) + 60, ...claims,
  }).setIssuedAt().setProtectedHeader({ alg: 'RS256' }).sign(key);
  idToken = await token();
  assert.deepEqual(await client.exchange('code', 'nonce'), { workspaceId: 'T123', memberId: 'U123' });
  for (const claims of [{ nonce: 'other' }, { ['https://slack.com/team_id']: 'T999' },
    { iss: 'https://example.test' }, { aud: 'other' }, { exp: 0 }, { sub: 'U999' }]) {
    idToken = await token(claims);
    await assert.rejects(client.exchange('code', 'nonce'));
  }
  idToken = await token({}, (await generateKeyPair('RS256')).privateKey);
  await assert.rejects(client.exchange('code', 'nonce'), /signature verification failed/);
});

test('requires a complete configuration and the exact HTTPS redirect on the application origin', () => {
  const env = { SLACK_BOT_TOKEN: 'bot', SLACK_CLIENT_ID: 'client', SLACK_CLIENT_SECRET: 'secret',
    SLACK_WORKSPACE_ID: 'T123', SLACK_REDIRECT_URL: 'https://alerts.example.test/api/slack/callback' };
  assert.equal(slackConfiguration({ SLACK_BOT_TOKEN: 'bot' }), undefined);
  assert.equal(slackConfiguration(env, 'https://alerts.example.test').workspaceId, 'T123');
  assert.throws(() => slackConfiguration(env, 'http://alerts.example.test'), /HTTPS/);
  assert.throws(() => slackConfiguration(env, 'https://other.example.test'), /HTTPS/);
});
