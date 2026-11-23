# World Event Alerts

World Event Alerts lets administrators configure RSS feeds and lets users subscribe to topics for email alerts. The local demo includes a synthetic news feed and uses Mailpit to capture the emails.

## Prerequisites

- Node.js 24.15 or later in the Node 24 release line.
- pnpm 11.25.0. If needed, install it with `npm install --global pnpm@11.25.0`. [pnpm installation](https://pnpm.io/installation/)
- Mailpit for the email demo and end-to-end tests. Use Docker or a standalone Mailpit executable. [Mailpit installation](https://mailpit.axllent.org/docs/install/)

## Run locally

Run these commands from the repository root after cloning or pulling. The backend and frontend each have their own lockfile.

```sh
pnpm --dir backend install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
```

In the first terminal, set up the two local accounts and start the API. The passwords below are examples for the local demo. Rerunning the seed preserves existing accounts and passwords.

**PowerShell**

```powershell
$env:DEMO_ADMIN_PASSWORD = 'local-admin-password'
$env:DEMO_USER_PASSWORD = 'local-user-password'
$env:JWT_SECRET = node -p "require('node:crypto').randomBytes(32).toString('hex')"
pnpm --dir backend seed
pnpm --dir backend start
```

**Bash**

```bash
export DEMO_ADMIN_PASSWORD='local-admin-password'
export DEMO_USER_PASSWORD='local-user-password'
export JWT_SECRET="$(node -p "require('node:crypto').randomBytes(32).toString('hex')")"
pnpm --dir backend seed
pnpm --dir backend start
```

In a second terminal, start Angular.

```sh
pnpm --dir frontend start
```

Open [World Event Alerts](http://127.0.0.1:4200) using `127.0.0.1`, which matches the API's default browser origin. Sign in as `admin@example.test` or `user@example.test` with the corresponding password set above. Angular proxies API requests to `127.0.0.1:3000`. SQLite is created automatically at `backend/data/alerts.sqlite`.

## Try the email demo

Keep the API and Angular running. Start Mailpit if you do not already have an instance listening on the demo ports.

```sh
docker run --detach --rm --name sonrisa-alerts-mailpit -p 127.0.0.1:11025:1025 -p 127.0.0.1:18025:8025 axllent/mailpit:v1.34.0
```

If you have the standalone executable, run it with the same ports in a separate terminal. [Mailpit runtime options](https://mailpit.axllent.org/docs/configuration/runtime-options/)

```sh
mailpit --smtp 127.0.0.1:11025 --listen 127.0.0.1:18025
```

In another terminal, start the fake RSS service.

```sh
pnpm --dir backend fake-rss
```

1. Sign in as `admin@example.test` and select **Feeds → Add feed**. Enter `http://127.0.0.1:18080/rss.xml` as the URL, `Sonrisa Demo News` as the publisher, `World News` as the topic, and `60` as the polling interval in seconds. Leave the feed enabled and save.
2. Wait for the feed to show **Healthy**. The first successful poll establishes a baseline.
3. Sign in as `user@example.test`, choose **Add subscription**, and save the `World News` topic.
4. Wait for the fixture to publish a headline after the subscription activates and for the next scheduled poll. Check the [Mailpit inbox](http://127.0.0.1:18025) for an email to `user@example.test` with a subject such as `News 2026-11-23T09:02:00.000Z`. Sign in as the admin again and open **Deliveries** to see its **Sent** status.

You can also add a public RSS URL directly in **Feeds**, including the [Hungarian Google News feed](https://news.google.com/rss?hl=hu&gl=HU&ceid=HU:hu). The first poll establishes a baseline. Later polls pick up new items that still appear in the publisher's feed.

## Run tests

The standard test suites and production build run independently of the local app and fixture.

```sh
pnpm --dir backend test
pnpm --dir frontend test --watch=false
pnpm --dir frontend build
```

The Playwright suite builds Angular and starts its own API, SQLite database, and fake RSS fixtures. Keep Mailpit running on the demo ports. Install the Playwright Chromium browser once, then run the suite.

```sh
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend e2e
```

To use an installed Microsoft Edge instead, set `TEST_BROWSER_CHANNEL=msedge` before running the suite. Set `TEST_MAILPIT_URL=http://127.0.0.1:18025` before running the backend tests to include their SMTP integration check.

Set `TEST_LIVE_RSS=1` before running the Playwright suite to include the live Google News scenario. It requires internet access to Google News.

See the [backend guide](docs/P3-task-04-backend.md) for configuration and API details and the [frontend guide](docs/P3-task-04-frontend.md) for browser test coverage.
