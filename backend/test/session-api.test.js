import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { seedDemoAccounts } from '../src/accounts.js';
import { createApp } from '../src/app.js';

const origin = 'https://alerts.example.test';
const password = 'test-account-password';

test('signs in with a secure cookie, uses the current account, and clears the cookie on logout', async (t) => {
  const app = createApp({ webOrigin: origin });
  t.after(() => app.close());
  await app.ready();
  await seedDemoAccounts(app.database, { DEMO_ADMIN_PASSWORD: password, DEMO_USER_PASSWORD: password });
  const login = await app.inject({ method: 'POST', url: '/api/session', headers: { origin },
    payload: { email: 'USER@example.test', password } });
  assert.equal(login.statusCode, 200);
  const account = login.json();
  assert.deepEqual(account, { id: 2, email: 'user@example.test', role: 'user' });
  const [session] = login.cookies;
  assert.equal(session.httpOnly, true);
  assert.equal(session.secure, true);
  assert.equal(session.sameSite, 'Strict');
  assert.equal(session.path, '/api');
  assert.equal(session.maxAge, 3_600);
  const claims = app.jwt.verify(session.value);
  assert.equal(claims.exp - claims.iat, 3_600);
  const headers = { cookie: `${session.name}=${session.value}`, origin };
  app.database.exec("UPDATE users SET role = 'admin' WHERE id = 2");
  assert.deepEqual((await app.inject({ url: '/api/session', headers })).json(), { ...account, role: 'admin' });
  const logout = await app.inject({ method: 'DELETE', url: '/api/session', headers });
  assert.equal(logout.statusCode, 204);
  assert.equal(logout.cookies[0].value, '');
  assert.equal(logout.cookies[0].path, '/api');
  assert.equal((await app.inject('/api/session')).statusCode, 401);
  app.database.exec('DELETE FROM users WHERE id = 2');
  assert.equal((await app.inject({ url: '/api/session', headers })).statusCode, 401);
});

test('rejects invalid claims and signatures, wrong credentials, invalid requests and cross-origin mutations', async (t) => {
  const jwtSecret = 'test-only-secret-for-session-api-verification';
  const app = createApp({ webOrigin: origin, jwtSecret });
  t.after(() => app.close());
  await app.ready();
  app.database.exec("INSERT INTO users VALUES (1, 'reader@example.test', 'hash', 'user', 0)");
  const valid = app.jwt.sign({ sub: '1' });
  assert.equal((await app.inject({ url: '/api/session', headers: { cookie: `alerts_session=${valid}` } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/session', headers: { authorization: `Bearer ${valid}` } })).statusCode, 401);
  const claims = app.jwt.decode(valid);
  function tokenFor(changes, alg = 'HS256', key = jwtSecret) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${encode({ alg, typ: 'JWT' })}.${encode({ ...claims, ...changes })}`;
    const hmac = createHmac(alg === 'HS384' ? 'sha384' : 'sha256', key).update(data).digest('base64url');
    return `${data}.${hmac}`;
  }
  const invalidTokens = {
    'invalid format': 'bad-token',
    'signature mismatch': tokenFor({}, 'HS256', 'different-test-signing-key'),
    'expired': tokenFor({ exp: 1 }),
    'issuer mismatch': tokenFor({ iss: 'other-issuer' }),
    'audience mismatch': tokenFor({ aud: 'other-client' }),
    'algorithm mismatch': tokenFor({}, 'HS384'),
    'missing expiry': tokenFor({ exp: undefined }),
    'missing subject': tokenFor({ sub: undefined }),
  };
  for (const [label, token] of Object.entries(invalidTokens)) {
    const response = await app.inject({ url: '/api/session', headers: { cookie: `alerts_session=${token}` } });
    assert.equal(response.statusCode, 401, label);
    assert.equal(response.json().code, 'unauthenticated');
  }
  const request = { method: 'POST', url: '/api/session', payload: { email: 'unknown@example.test', password } };
  assert.equal((await app.inject(request)).statusCode, 403);
  assert.equal((await app.inject({ ...request, headers: { origin: 'https://other.example.test' } })).statusCode, 403);
  const invalidCredentials = await app.inject({ ...request, headers: { origin } });
  assert.equal(invalidCredentials.statusCode, 401);
  assert.equal(invalidCredentials.json().code, 'invalid_credentials');
  const invalidBody = await app.inject({ ...request, headers: { origin }, payload: { password } });
  assert.equal(invalidBody.statusCode, 400);
  assert.equal(invalidBody.json().code, 'invalid_request');
});
