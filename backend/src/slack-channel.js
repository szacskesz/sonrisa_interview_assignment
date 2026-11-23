const temporaryErrors = new Set(['internal_error', 'fatal_error', 'service_unavailable', 'request_timeout']);
const knownErrors = new Set(['invalid_auth', 'token_revoked', 'missing_scope', 'account_inactive',
  'channel_not_found', 'user_not_found', 'not_in_channel', 'cannot_dm_bot', 'user_disabled', 'is_archived']);
const escapedCharacters = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function slackText({ title, topic, publisher, url, publishedAt, occurredAt }) {
  const lines = [title, `Topic: ${topic}`, `Source: ${publisher}`];
  const time = occurredAt ?? publishedAt;
  if (Number.isFinite(time)) {
    lines.push(`${occurredAt === undefined ? 'Published' : 'Occurred'} (UTC): ${new Date(time).toISOString()}`);
  }
  const link = typeof url === 'string' ? URL.parse(url) : null;
  if (link && ['https:', 'http:'].includes(link.protocol) && !link.username && !link.password) lines.push(link.href);
  return lines.join('\n').replace(/[&<>]/g, (character) => escapedCharacters[character]);
}

/** Deliver normalized alerts through one installed Slack bot with queue-compatible retry outcomes. */
export function createSlackChannel({ botToken, workspaceId }, { fetchRequest = fetch, now = Date.now } = {}) {
  const cooldowns = new Map();
  let verifiedWorkspace = false;

  async function call(method, body) {
    const retryAt = cooldowns.get(method);
    if (retryAt > now()) return { result: { status: 'retryable', error: 'Slack rate limit', retryAt } };
    try {
      const response = await fetchRequest(`https://slack.com/api/${method}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.status === 429) {
        const delay = Number(response.headers.get('Retry-After'));
        const currentTime = now();
        const deadline = currentTime + delay * 1000;
        const retryAt = Number.isInteger(delay) && delay > 0 && Number.isSafeInteger(deadline) ? deadline : currentTime + 60_000;
        cooldowns.set(method, retryAt);
        return { result: { status: 'retryable', error: 'Slack rate limit', retryAt } };
      }
      if (!response.ok) return { result: {
        status: response.status >= 500 || response.status === 408 ? 'retryable' : 'permanent',
        error: `Slack returned HTTP ${response.status}`,
      } };
      const data = await response.json();
      if (data?.ok === true) return { data };
      if (temporaryErrors.has(data?.error)) return { result: { status: 'retryable', error: 'Slack service error' } };
      const reason = knownErrors.has(data?.error) ? ` (${data.error})` : '';
      return { result: { status: 'permanent', error: `Slack rejected the request${reason}` } };
    } catch {
      return { result: { status: 'retryable', error: 'Slack connection or response failed' } };
    }
  }

  return {
    availableAt: () => Math.max(0, ...cooldowns.values()),
    async send(destination, alert, isCurrent = () => true) {
      const [workspace, member, ...extra] = destination.split(':');
      if (workspace !== workspaceId || !/^[UW][A-Z0-9]{1,63}$/.test(member ?? '') || extra.length) {
        return { status: 'permanent', error: 'Slack destination is invalid' };
      }
      if (!verifiedWorkspace) {
        const auth = await call('auth.test', {});
        if (auth.result) return auth.result;
        if (auth.data.team_id !== workspaceId || !auth.data.bot_id) {
          return { status: 'permanent', error: 'Slack bot is installed in a different workspace or the token is invalid' };
        }
        verifiedWorkspace = true;
      }
      if (!isCurrent()) return { status: 'canceled' };
      const opened = await call('conversations.open', { users: member });
      if (opened.result) return opened.result;
      const channel = opened.data.channel?.id;
      if (typeof channel !== 'string' || !/^D[A-Z0-9]+$/.test(channel)) {
        return { status: 'permanent', error: 'Slack did not return a direct message conversation' };
      }
      if (!isCurrent()) return { status: 'canceled' };
      const sent = await call('chat.postMessage', {
        channel, text: slackText(alert), mrkdwn: false, link_names: false, unfurl_links: false, unfurl_media: false,
      });
      return sent.result ?? { status: 'sent' };
    },
  };
}
