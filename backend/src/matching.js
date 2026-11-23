/** Resolve recipients and recheck eligibility with the same topic and activation rule. */
export function createMatcher(database, { slackWorkspaceId = null } = {}) {
  const eligible = `
    WITH recipients AS (
      SELECT selection.channel,
        CASE selection.channel WHEN 'email' THEN account.email
          ELSE account.slack_workspace_id || ':' || account.slack_member_id END AS destination
      FROM subscriptions AS subscription
      JOIN users AS account ON account.id = subscription.user_id
      JOIN subscription_channels AS selection ON selection.subscription_id = subscription.id
      WHERE subscription.status = 'active' AND subscription.topic = :topic
        AND subscription.activated_at_ms < :publishedAt AND selection.activated_at_ms < :publishedAt
        AND (selection.channel = 'email'
          OR (selection.channel = 'slack' AND account.slack_workspace_id = :workspaceId
            AND account.slack_connected_at_ms < :publishedAt))
    )
  `;
  const recipients = database.prepare(`${eligible} SELECT DISTINCT * FROM recipients ORDER BY channel, destination`);
  const matchingRecipient = database.prepare(`
    ${eligible} SELECT 1 FROM recipients WHERE channel = :channel AND destination = :destination LIMIT 1
  `);
  return {
    recipients: (topic, publishedAt) => recipients.all({ topic, publishedAt, workspaceId: slackWorkspaceId }),
    isEligible: (topic, publishedAt, channel, destination) => Boolean(
      matchingRecipient.get({ topic, publishedAt, workspaceId: slackWorkspaceId, channel, destination }),
    ),
  };
}
