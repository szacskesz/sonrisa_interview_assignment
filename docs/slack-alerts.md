# Slack setup and operation

World Alerts supports one installed Slack bot and one linked Slack member per user. On each subscription, a user chooses Email, Slack direct message, or both.

## Configure account linking

The workspace installation lets the bot send direct messages. When a user clicks **Connect Slack**, Slack asks for consent and then sends the user's browser back to World Alerts. The browser return address is the HTTPS redirect URL. World Alerts uses the authorization response to verify which Slack account the user owns. [Sign in with Slack](https://docs.slack.dev/authentication/sign-in-with-slack/)

1. Use a World Alerts HTTPS deployment or an HTTPS development address. Use that address when opening the application. Serve the Angular build there, forward `/api/*` to the Node API, and serve the Angular index for browser routes such as `/subscriptions`. The Node listener can stay on loopback behind the HTTPS proxy.
2. In the [Slack app dashboard](https://api.slack.com/apps), open the installed app and go to **OAuth & Permissions → Redirect URLs**. Add `https://your-alerts-host.example/api/slack/callback` with your actual hostname, then save. [Slack redirect URL requirements](https://docs.slack.dev/authentication/installing-with-oauth/#asking-for-permissions)
3. Start the backend with the following server-side environment variables. Keep the bot token and client secret in your local environment or deployment secret store.

| Variable | Value |
| --- | --- |
| `WEB_ORIGIN` | World Alerts HTTPS origin, such as `https://your-alerts-host.example`, without a trailing slash |
| `SLACK_REDIRECT_URL` | The exact URL saved in Slack, with `/api/slack/callback` appended to the origin |
| `SLACK_WORKSPACE_ID` | The workspace ID beginning with `T` |
| `SLACK_BOT_TOKEN` | Bot User OAuth Token from **OAuth & Permissions**, beginning with `xoxb-` |
| `SLACK_CLIENT_ID` | Client ID from **Basic Information → App Credentials** |
| `SLACK_CLIENT_SECRET` | Client Secret from **Basic Information → App Credentials** |

The bot requires `im:write` and `chat:write` bot scopes. When a user connects, the separate OpenID request uses `openid profile` to retrieve the signed workspace and member identity. SQLite stores the verified IDs and connection time. The user access token returned by Slack is discarded. The existing World Alerts sign-in is required for linking and stays in use afterwards. [OpenID discovery](https://slack.com/.well-known/openid-configuration) · [Slack bot authentication](https://docs.slack.dev/reference/methods/auth.test/)

## Verify your workspace

1. Use an account belonging to the configured workspace that has agreed to receive the test. Sign in to World Alerts through its HTTPS address and choose **Subscriptions → Connect Slack**.
2. Complete Slack consent and confirm that World Alerts shows the connected workspace and member.
3. With the fake RSS source running, subscribe to its topic and select **Slack direct message**. To check both channels, leave **Email** selected and keep Mailpit available.
4. After a fresh test headline is published, open the bot's conversation in [Slack in your browser](https://app.slack.com/client). Confirm there is one new message for the headline. In World Alerts **Deliveries**, confirm the **Slack DM** status and the separate **Email** status if selected.
5. Disconnect in World Alerts and confirm that the subscription shows **Slack needs connection**. Reconnecting resumes Slack for events newer than the new connection time.

## API and queue behavior

| Endpoint | Contract |
| --- | --- |
| `GET /api/slack` | Return `available` and `connection` for the signed-in account. `connection` is null or contains `workspaceId` and `memberId`. |
| `POST /api/slack/start` | Set a short-lived browser cookie and return `authorizeUrl` for Slack consent. |
| `GET /api/slack/callback` | Verify the one-time Slack response and return the browser to Subscriptions. |
| `POST /api/slack/confirm` | Save the verified identity when the original browser and signed-in account confirm it. Return the new Slack status. One Slack identity can belong to only one World Alerts account. |
| `DELETE /api/slack` | Clear the current account's link, preserve its delivery choices, and return HTTP 204. |
| `GET/POST /api/subscriptions`, `PATCH /api/subscriptions/:id` | Return `channels` with each subscription. Create and edit accept a nonempty array of distinct `email` and `slack` values. Omitting it defaults to Email on creation and preserves channels on edit. |
| `GET /api/admin/deliveries` | Include `channel` alongside each independent job outcome. |

Start and confirm use the normal same-origin API authorization rules. Linking state lasts five minutes and is kept in the API process. After an API restart during consent, start the link again. Existing subscriptions are migrated to Email with their original activation times.

The worker checks membership of an active subscription and the channel's activation each time it enqueues or attempts a delivery. Slack also checks the current linked workspace, recipient, and connection time. It honors `Retry-After` and keeps processing email. Pending job deadlines are durable, and the workspace rate-limit state is held in the running API process. If a provider accepts a message but the response is lost, retrying the job can deliver a duplicate. [Slack rate limits](https://docs.slack.dev/apis/web-api/rate-limits/)

## Automated verification

Run the [standard test commands](../README.md#run-tests). Playwright simulates Slack consent and Slack Web API responses, and uses real Mailpit for email. The controlled run requires neither a Slack token nor an HTTPS deployment. See the [review screenshots](evidences/slack/README.md).
