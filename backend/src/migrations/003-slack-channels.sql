ALTER TABLE users ADD COLUMN slack_workspace_id TEXT;
ALTER TABLE users ADD COLUMN slack_member_id TEXT;
ALTER TABLE users ADD COLUMN slack_connected_at_ms INTEGER CHECK (
  (slack_workspace_id IS NULL AND slack_member_id IS NULL AND slack_connected_at_ms IS NULL)
  OR
  (slack_workspace_id IS NOT NULL AND slack_member_id IS NOT NULL AND slack_connected_at_ms IS NOT NULL)
);

CREATE UNIQUE INDEX users_slack_identity ON users (slack_workspace_id, slack_member_id);

CREATE TABLE subscription_channels (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'slack')),
  activated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (subscription_id, channel)
) STRICT;

INSERT INTO subscription_channels (subscription_id, channel, activated_at_ms)
SELECT id, 'email', activated_at_ms FROM subscriptions;
