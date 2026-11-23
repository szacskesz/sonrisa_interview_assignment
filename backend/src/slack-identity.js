import { createRemoteJWKSet, jwtVerify } from 'jose';

const issuer = 'https://slack.com';
const workspaceClaim = `${issuer}/team_id`;
const memberClaim = `${issuer}/user_id`;
const workspacePattern = /^T[A-Z0-9]{1,63}$/;
const memberPattern = /^[UW][A-Z0-9]{1,63}$/;

/** Read optional single-workspace configuration and enforce a same-origin HTTPS callback. */
export function slackConfiguration(env, webOrigin) {
  const { SLACK_BOT_TOKEN: botToken, SLACK_CLIENT_ID: clientId, SLACK_CLIENT_SECRET: clientSecret,
    SLACK_WORKSPACE_ID: workspaceId, SLACK_REDIRECT_URL: redirectUrl } = env;
  if (![botToken, clientId, clientSecret, workspaceId, redirectUrl].every(Boolean)) return undefined;
  if (!workspacePattern.test(workspaceId) || redirectUrl !== `${webOrigin}/api/slack/callback` ||
      new URL(redirectUrl).protocol !== 'https:') {
    throw new Error('Set SLACK_WORKSPACE_ID and an HTTPS SLACK_REDIRECT_URL on WEB_ORIGIN at /api/slack/callback');
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
          typeof memberId !== 'string' || !memberPattern.test(memberId) || payload.sub !== memberId ||
          (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) {
        throw new Error('Slack identity did not match the connection request');
      }
      return { workspaceId, memberId };
    },
  };
}
