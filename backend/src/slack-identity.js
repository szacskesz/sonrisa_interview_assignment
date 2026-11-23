import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer = 'https://slack.com';
const workspaceClaim = `${issuer}/team_id`;
const memberClaim = `${issuer}/user_id`;
const workspacePattern = /^T[A-Z0-9]{1,63}$/;
const memberPattern = /^[UW][A-Z0-9]{1,63}$/;

/** Read optional Slack settings and allow HTTP callbacks only for localhost development. */
export function slackConfiguration(env, webOrigin) {
  const { SLACK_BOT_TOKEN: botToken, SLACK_CLIENT_ID: clientId, SLACK_CLIENT_SECRET: clientSecret,
    SLACK_WORKSPACE_ID: workspaceId, SLACK_REDIRECT_URL: redirectUrl } = env;
  if (![botToken, clientId, clientSecret, workspaceId, redirectUrl].every(Boolean)) return undefined;
  const origin = URL.parse(webOrigin);
  const localHttp = origin?.protocol === 'http:' && origin.hostname === 'localhost';
  if (!workspacePattern.test(workspaceId) || origin?.origin !== webOrigin ||
      redirectUrl !== `${webOrigin}/api/slack/callback` || (origin?.protocol !== 'https:' && !localHttp)) {
    throw new Error('Set a valid SLACK_WORKSPACE_ID and use WEB_ORIGIN plus /api/slack/callback for SLACK_REDIRECT_URL. HTTPS is required except on localhost.');
  }
  return { botToken, clientId, clientSecret, workspaceId, redirectUrl };
}

/** Create a Slack OpenID Connect client. Only the verified workspace and member are retained. */
export function createSlackIdentity(config, {
  fetchRequest = fetch, keys = createRemoteJWKSet(new URL(`${issuer}/openid/connect/keys`)),
} = {}) {
  const { clientId, clientSecret, workspaceId, redirectUrl } = config;
  return {
    workspaceId,
    authorize(state, nonce) {
      const url = new URL('/openid/connect/authorize', issuer);
      url.search = new URLSearchParams({
        response_type: 'code', response_mode: 'query', scope: 'openid profile', client_id: clientId,
        redirect_uri: redirectUrl, team: workspaceId, state, nonce,
      });
      return url.href;
    },
    async exchange(code, nonce) {
      const response = await fetchRequest(`${issuer}/api/openid.connect.token`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          grant_type: 'authorization_code', code, client_id: clientId,
          client_secret: clientSecret, redirect_uri: redirectUrl,
        }),
      });
      if (!response.ok) throw new Error('Slack identity exchange failed');
      const token = await response.json();
      if (token.ok !== true || typeof token.id_token !== 'string') throw new Error('Slack identity exchange failed');
      const { payload } = await jwtVerify(token.id_token, keys, {
        algorithms: ['RS256'], issuer, audience: clientId,
        requiredClaims: ['sub', 'exp', 'iat', 'nonce', workspaceClaim, memberClaim],
      });
      const memberId = payload[memberClaim];
      if (payload.nonce !== nonce || payload[workspaceClaim] !== workspaceId ||
          typeof memberId !== 'string' || !memberPattern.test(memberId) || typeof payload.sub !== 'string' || !payload.sub ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) {
        throw new Error('Slack identity did not match the connection request');
      }
      return { workspaceId, memberId };
    },
  };
}
