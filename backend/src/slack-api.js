import { randomBytes } from 'node:crypto';
import { ApiError } from './api-errors.js';

const handshake = 'alerts_slack_link';
const ttl = 5 * 60_000;
const cookieOptions = { path: '/api/slack', httpOnly: true, secure: true, sameSite: 'lax' };
const randomToken = () => randomBytes(32).toString('base64url');

/** Link Slack only after the initiating signed-in account confirms a verified browser callback. */
export function configureSlackApi(app, { identity, now }) {
  const flows = new Map();
  const requireAccount = app.requireAccount;
  const failure = () => new ApiError(400, 'slack_link_invalid', 'Start a new Slack connection and try again');
  const status = (userId) => {
    const { slack_workspace_id, slack_member_id } = app.database.prepare(
      'SELECT slack_workspace_id, slack_member_id FROM users WHERE id = ?',
    ).get(userId);
    return {
      available: Boolean(identity),
      connection: slack_member_id ? { workspaceId: slack_workspace_id, memberId: slack_member_id } : null,
    };
  };

  app.get('/api/slack', { preHandler: requireAccount }, async ({ account }) => status(account.id));
  app.post('/api/slack/start', { preHandler: requireAccount }, async ({ account, cookies }, reply) => {
    if (!identity) throw new ApiError(503, 'slack_unavailable', 'Slack is unavailable');
    for (const [key, flow] of flows) {
      if (flow.expiresAt <= now() || key === cookies[handshake]) flows.delete(key);
    }
    if (flows.size >= 1_000) throw new ApiError(503, 'slack_busy', 'Try connecting Slack again later');
    const key = randomToken();
    const state = randomToken();
    const nonce = randomToken();
    flows.set(key, { userId: account.id, state, nonce, expiresAt: now() + ttl });
    reply.setCookie(handshake, key, { ...cookieOptions, maxAge: ttl / 1000 });
    return { authorizeUrl: identity.authorize(state, nonce) };
  });
  app.get('/api/slack/callback', async ({ query, cookies }, reply) => {
    const key = cookies[handshake];
    const flow = flows.get(key);
    reply.header('Referrer-Policy', 'no-referrer');
    const failed = () => reply.redirect('/subscriptions?slack=failed', 303);
    if (!flow?.state || flow.expiresAt <= now() || query.state !== flow.state) return failed();
    delete flow.state;
    if (query.error || typeof query.code !== 'string' || !query.code || query.code.length > 2048) {
      flows.delete(key);
      return failed();
    }
    try {
      const verified = await identity.exchange(query.code, flow.nonce);
      if (flows.get(key) !== flow || flow.expiresAt <= now()) return failed();
      flow.connection = verified;
      return reply.redirect('/subscriptions?slack=confirm', 303);
    } catch {
      flows.delete(key);
      return failed();
    }
  });
  app.post('/api/slack/confirm', { preHandler: requireAccount }, async ({ account, cookies }, reply) => {
    const key = cookies[handshake];
    const flow = flows.get(key);
    if (flow?.userId !== account.id || !flow.connection || flow.expiresAt <= now()) throw failure();
    flows.delete(key);
    reply.clearCookie(handshake, cookieOptions);
    const { workspaceId, memberId } = flow.connection;
    try {
      app.database.prepare(`
        UPDATE users SET slack_workspace_id = ?, slack_member_id = ?, slack_connected_at_ms = ?
        WHERE id = ?
        AND (slack_workspace_id IS NOT ? OR slack_member_id IS NOT ?)
      `).run(workspaceId, memberId, now(), account.id, workspaceId, memberId);
    } catch (error) {
      if (error.errcode !== 2067) throw error;
      throw new ApiError(409, 'slack_already_linked', 'This Slack account is already connected to another user');
    }
    return status(account.id);
  });
  app.delete('/api/slack', { preHandler: requireAccount }, async ({ account }, reply) => {
    for (const [key, flow] of flows) {
      if (flow.userId === account.id) flows.delete(key);
    }
    app.database.prepare(`
      UPDATE users SET slack_workspace_id = NULL, slack_member_id = NULL, slack_connected_at_ms = NULL WHERE id = ?
    `).run(account.id);
    return reply.clearCookie(handshake, cookieOptions).code(204).send();
  });
}
