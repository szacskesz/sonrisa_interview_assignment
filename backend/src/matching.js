/** Resolve recipients and recheck eligibility with the same topic and activation rule. */
export function createMatcher(database) {
  const eligible = `
    FROM subscriptions AS subscription
    JOIN users AS account ON account.id = subscription.user_id
    WHERE subscription.status = 'active' AND subscription.topic = ?
      AND subscription.activated_at_ms < ?
  `;
  const recipients = database.prepare(`SELECT DISTINCT account.email ${eligible} ORDER BY account.email`);
  const matchingRecipient = database.prepare(`SELECT 1 ${eligible} AND account.email = ? LIMIT 1`);
  return {
    recipients: (topic, publishedAt) => recipients.all(topic, publishedAt).map(({ email }) => email),
    isEligible: (topic, publishedAt, email) => Boolean(matchingRecipient.get(topic, publishedAt, email)),
  };
}
