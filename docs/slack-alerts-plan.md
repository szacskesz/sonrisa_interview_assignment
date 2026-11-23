# Slack alert delivery plan

## Proposed first release

Users choose **Email**, **Slack direct message**, or both for each topic subscription. The first release uses one operator-configured Slack workspace. An operator installs the World Alerts Slack app once, and each user links their own Slack account from the application. The app sends direct messages as its bot.

Per-subscription settings let a user receive high-priority earthquake alerts in both places while receiving news by email only. A workspace-wide channel could serve shared alerts in a later release. Direct messages fit the current account-level preference and keep each user's alerts private.

## User and admin workflow

1. In **Subscriptions**, the user opens **Add subscription** or **Edit subscription**. Under **Send alerts by**, two checkboxes control **Email** and **Slack direct message**. New subscriptions start with Email selected. Saving requires at least one channel.
2. A **Connect Slack** action on **Subscriptions** links the current account through Slack. The app shows the connected workspace and member. The user can then select Slack for any subscription. Each subscription row shows its selected delivery channels.
3. Disconnecting Slack stops its delivery and preserves the user's selections. Affected subscriptions display **Slack needs connection**. An enabled Email selection continues to receive alerts. Reconnecting Slack starts its delivery from the new connection time.
4. The admin **Deliveries** table adds a **Channel** column. When both channels are selected, the admin can see each job and its result independently.

| User selection | Result |
| --- | --- |
| Email | Deliver to the account's provisioned email address. |
| Slack direct message | Deliver to the linked Slack member. A new Slack selection requires a connected account. |
| Both | Queue one email and one Slack message, with independent retries. |

## Slack setup and account linking

- Configure one Slack app and install its bot in the chosen workspace. Keep the bot token, OAuth client credentials, workspace ID, and redirect URL in server configuration. Verify the bot and workspace with `auth.test`. Use a same-origin callback with HTTPS on deployed hosts. HTTP is allowed only for localhost development. Present Slack as unavailable when setup is incomplete. [Slack app installation](https://docs.slack.dev/authentication/installing-with-oauth/) · [Slack `auth.test`](https://docs.slack.dev/reference/methods/auth.test/)
- Use **Sign in with Slack** as a separate OpenID Connect flow to verify the member and workspace while the user is signed into World Alerts. Request identity scopes separately from the bot installation scopes. Verify the signed identity token, issuer, audience, expiry, nonce, workspace, and match the response to a short-lived one-time state bound to the initiating app account and browser. Discard the returned user token after identity verification. Slack's discovery endpoint specifies query callbacks and RS256 signing. The implementation uses these settings and the documented `openid profile` scopes. The operator confirmed live DM delivery after manually pairing the demo user. Live browser linking over HTTPS remains pending. [Sign in with Slack](https://docs.slack.dev/authentication/sign-in-with-slack/) · [OpenID discovery](https://slack.com/.well-known/openid-configuration)
- The existing session cookie uses `SameSite=Strict`. Use a separate short-lived Secure, HTTP-only handshake cookie for the cross-site callback and a same-origin authenticated confirmation step. The confirmation must match the account that started the flow. Expired, canceled, or replayed flows return to a safe connection state. A pending flow can be restarted if the single API process restarts during linking.
- For each eligible Slack job, use the bot's `im:write` scope with `conversations.open` to obtain the direct-message conversation ID. Send the alert with `chat.postMessage` and `chat:write`. Use the shared alert data for the headline, topic, source, link, and UTC occurrence time where present. Treat provider titles as plain text and disable link previews. [Open a Slack conversation](https://docs.slack.dev/reference/methods/conversations.open/) · [Post a Slack message](https://docs.slack.dev/reference/methods/chat.postMessage/)

## SQLite and API changes

| Record | Proposed change |
| --- | --- |
| `subscription_channels` | Add one row per selected channel and subscription, with `channel` and `activated_at_ms`. Use the subscription and channel as the key and remove its rows when the subscription is removed. Backfill every existing subscription with Email and its existing activation time in the same migration. |
| `users` | Add nullable `slack_workspace_id`, `slack_member_id`, and `slack_connected_at_ms` columns. Each user row holds at most one Slack account. A check constraint requires all three fields to be set together or all three to be empty. A unique index on the workspace and member pair prevents linking that Slack account to multiple app users. |
| `delivery_jobs` | Reuse the existing channel, destination, deduplication key, status, and retry fields. Use an internal workspace/member pair as the Slack destination and expose the channel in the existing admin response. |

Add `channels` to subscription responses and to create and edit requests. Omitted channels default to Email on creation and preserve existing choices on edit. Validate the supported values, account ownership, and the presence of at least one selection. Add account-scoped endpoints for Slack connection status, starting and confirming a link, handling the provider callback, and disconnecting. Keep credentials and provider tokens out of user and admin responses and logs.

Existing user rows start with all three Slack fields empty. Connecting sets them in one atomic update and disconnecting clears them together. The bot token and OAuth credentials stay in server configuration.

## Matching, activation, and retries

Resolve Email and Slack destinations during subscription matching. RSS and USGS continue to supply the same normalized events. When enqueuing and before sending or retrying, require an active matching subscription, a selected channel, and the correct current destination. For Slack, the event must occur after the latest applicable subscription, channel, and connection activation times. Adding Slack to an active Email subscription therefore starts Slack delivery at that change and preserves the Email cutoff. Topic changes and resuming a subscription apply the existing activation rules to both channels.

Register Slack alongside the email adapter. Reuse the durable queue for retryable network and provider failures. For HTTP 429, use Slack's `Retry-After` and defer further Slack requests for the affected workspace and method while Email jobs can proceed. Permanent failures appear as separate Slack outcomes with safe diagnostics. Overlapping subscriptions are deduplicated per event, channel, and destination. [Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/) · [Slack Node Web API SDK](https://docs.slack.dev/tools/node-slack-sdk/web-api/)

## Implementation and verification order

| ID | Task | Completion check |
| --- | --- | --- |
| SLACK-02 | Verify provider setup in a test workspace | Validate the callback and required identity claims, verify bot scopes, and send a synthetic DM to an explicitly authorized test member. Confirm Node 24 compatibility before pinning the Slack and OpenID dependencies. |
| SLACK-03 | Add and verify the SQLite migration | Existing subscriptions retain their Email activation times. User rows accept one complete Slack link and reject duplicate workspace/member pairs. |
| SLACK-04 | Implement account linking | Verify connection state, consent, ownership, expiry, replay protection, disconnect, and workspace/member restrictions. |
| SLACK-05 | Implement subscription channel settings | Validate create and edit requests, and preserve compatibility with existing Email clients. |
| SLACK-06 | Extend matching and the queue | Verify Email-only, Slack-only, both, newly enabled channels, reconnect cutoffs, and deduplication. |
| SLACK-07 | Add Slack delivery | Verify DM routing, message content, rate limits, retries, permanent failures, and Email delivery during a Slack outage. |
| SLACK-08 | Add the Angular controls and delivery status | Verify connection feedback, the two checkboxes, disconnected states, and the admin Channel column. |
| SLACK-09 | Verify the complete workflow | Run controlled end-to-end tests for both providers, plus an opt-in check in the test workspace. Capture the subscription screens, admin delivery outcomes, and the received Slack DM in the review evidence. |

Use Mailpit and a controlled Slack API response for repeatable automated delivery tests. Controlled development and tests can proceed while the live workspace is being configured. The live check requires a Slack test workspace, an installed bot, a callback that Slack accepts during authorization, and a test recipient who has agreed to receive the message.

## Review decisions

The approved design uses one Slack account per app user, stored on the user row, with channel choices per subscription and direct messages in one configured Slack workspace. The backend uses native Node fetch for the three Slack Web API calls and `jose` for OpenID signature and claims verification. The [setup guide](slack-alerts.md) describes the remaining workspace smoke test, and the [review evidence](evidences/slack/README.md) shows the controlled run.
