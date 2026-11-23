import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { verifyPassword } from './accounts.js';
import { ApiError } from './api-errors.js';

const cookieName = 'alerts_session';
const lifetimeSeconds = 60 * 60;
const issuer = 'world-event-alerts';
const audience = 'world-event-alerts-web';
const dummyHash = `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;

function accountPayload({ id, email, role }) {
  return { id, email, role };
}

/** Configure origin checks and the signed, cookie-only session for same-origin clients. */
export function configureSessionApi(app, { secret, webOrigin }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('Set JWT_SECRET to a random secret of at least 32 bytes');
  }
  const origin = new URL(webOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== webOrigin) {
    throw new Error('WEB_ORIGIN must be an HTTP or HTTPS origin without a path');
  }
  const cookieOptions = { path: '/api', httpOnly: true, sameSite: 'strict', secure: origin.protocol === 'https:' };
  app.register(cookie);
  app.register(jwt, {
    secret,
    cookie: { cookieName, signed: false },
    sign: { algorithm: 'HS256', iss: issuer, aud: audience, expiresIn: '1h' },
    verify: { algorithms: ['HS256'], allowedIss: issuer, allowedAud: audience, requiredClaims: ['sub', 'iss', 'aud', 'exp'] },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.origin !== webOrigin) {
      throw new ApiError(403, 'invalid_origin', 'Request origin is not allowed');
    }
  });
  app.decorateRequest('account', null);
  const findAccount = () => app.database.prepare('SELECT id, email, role FROM users WHERE id = ?');
  app.decorate('requireAccount', async (request) => {
    let token;
    try {
      token = await request.jwtVerify({ onlyCookie: true });
    } catch {
      throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    }
    const id = Number(token.sub);
    const account = Number.isSafeInteger(id) && id > 0 && String(id) === token.sub ? findAccount().get(id) : undefined;
    if (!account) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    request.account = accountPayload(account);
  });
  app.decorate('requireAdmin', async (request) => {
    await app.requireAccount(request);
    if (request.account.role !== 'admin') throw new ApiError(403, 'forbidden', 'Administrator access is required');
  });

  app.post('/api/session', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['email', 'password'],
    properties: {
      email: { type: 'string', minLength: 1, maxLength: 254 },
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
  } } }, async (request, reply) => {
    const { email, password } = request.body;
    const account = app.database.prepare('SELECT id, email, role, password_hash FROM users WHERE email = ?')
      .get(email.trim());
    const valid = await verifyPassword(password, account?.password_hash ?? dummyHash);
    if (!account || !valid) throw new ApiError(401, 'invalid_credentials', 'Email or password is incorrect');
    const token = await reply.jwtSign({ sub: String(account.id) });
    reply.setCookie(cookieName, token, { ...cookieOptions, maxAge: lifetimeSeconds });
    return accountPayload(account);
  });
  app.get('/api/session', { preHandler: app.requireAccount }, async (request) => request.account);
  app.delete('/api/session', async (_request, reply) => {
    return reply.clearCookie(cookieName, cookieOptions).code(204).send();
  });
}
