# Backend development

Install and run the API from the repository root with Node.js 24.15 or later in the Node 24 release line and pnpm.

```powershell
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend test
pnpm --dir backend start
```

The server listens on `127.0.0.1:3000` by default. Set `API_PORT` to change the port. `GET /api/health` returns HTTP 200 and `{"status":"ok"}` when the API can serve requests.

Set `JWT_SECRET` to a random secret of at least 32 bytes before starting the API. Browser mutations must send the configured `WEB_ORIGIN` as their origin. It defaults to `http://127.0.0.1:4200`. Use the configured address when opening Angular.

The server opens `backend/data/alerts.sqlite` by default. Set `ALERTS_DB_PATH` to use a different file. The app closes its database when Fastify shuts down. In-process app tests use an isolated in-memory database unless they supply a path.

Startup applies the SQL migrations under `backend/src/migrations/` in order. SQLite records the applied version in `PRAGMA user_version`. If a migration fails, SQLite rolls back its changes and API startup fails.

## Demo accounts

Set `DEMO_ADMIN_PASSWORD` and `DEMO_USER_PASSWORD` to local demo secrets of 12 to 128 characters, then run `pnpm --dir backend seed`. The default emails are `admin@example.test` and `user@example.test`. Override them with `DEMO_ADMIN_EMAIL` and `DEMO_USER_EMAIL`. The seed applies migrations and creates both accounts with salted scrypt hashes. Rerunning it preserves existing accounts and passwords. Use the same `ALERTS_DB_PATH` for seeding and the server.

`POST /api/session` takes `{email,password}`, returns `{id,email,role}`, and sets the HTTP-only session cookie. Sessions expire after one hour. `GET /api/session` finds the current account and role and returns HTTP 401 if the session is invalid. `DELETE /api/session` clears the cookie and returns HTTP 204. An HTTPS origin also sets the Secure cookie attribute. Errors use `{code,message}`.

## Fake RSS

Run `pnpm --dir backend fake-rss` in a separate terminal. By default it serves `http://127.0.0.1:18080/rss.xml`. Set `FAKE_RSS_PORT` to change the port. The base URL returns the latest UTC minute headline, such as `News 2026-11-23T09:02:00.000Z`. Supplying both `after` and `through` as UTC minute timestamps returns up to 100 items in publication order. The lower bound is exclusive and the upper bound is inclusive.

The fake RSS adapter exposes `latest()` and `page(after, through)`. It validates chronological replay pages. `FIXTURE_RSS_URLS` sets the comma-separated endpoints that use this fixture-specific protocol. The default is the local fake feed URL above. The API also accepts `TRUSTED_RSS_URLS` as the prior name for this setting.

## Public RSS

Admins can use public HTTP or HTTPS RSS URLs, including URLs with query parameters. Each poll reads the current RSS 2.0 or RSS 1.0 snapshot. Requests and redirects to nonpublic network addresses are blocked. The adapter returns normalized articles with stable identifiers, titles, optional links, and publication times when provided.

The feed store enforces a unique normalized URL. An enabled feed defaults to a 300-second interval and is initially due immediately. Changing the interval reschedules the next poll and keeps its checkpoint. Re-enabling or replacing the URL clears the baseline and prior poll health.

`GET /api/admin/feeds` returns `{feeds}`. `POST /api/admin/feeds` takes `url`, `publisher`, `topic`, and optional `enabled` and `pollIntervalSeconds`. It returns the created feed with HTTP 201. `PATCH /api/admin/feeds/:id` accepts changes to these fields and returns the updated feed. Feed responses also include `id`, `nextPollAt`, `lastPollAttemptAt`, `lastPollSuccessAt`, and `lastPollError`. Timestamps use UTC Unix milliseconds. Duplicate URLs return HTTP 409 and other invalid settings return HTTP 400.

## Subscriptions

The subscription store scopes reads and writes to the owner's account ID. Creation starts active. Resuming or changing the topic records a new activation time. Pausing preserves the previous activation time, and removing a subscription deletes the record.

`GET /api/topics` returns `{topics: string[]}` for a signed-in account. Topics are distinct and come from enabled feeds.

`GET /api/subscriptions` returns `{subscriptions}`. Each subscription includes `id`, `topic`, `status`, `destination`, `createdAt`, and `activatedAt`. `POST /api/subscriptions` takes a topic and returns the created record with HTTP 201. `PATCH /api/subscriptions/:id` accepts `topic`, `status`, or both, and returns the updated record. `DELETE /api/subscriptions/:id` returns HTTP 204. An ID outside the signed-in account's ownership returns HTTP 404. Creating a subscription or switching its topic requires a currently enabled feed for that topic.

The matcher returns distinct account emails for active subscriptions whose topic matches the event and whose activation precedes its publication. The single-recipient check uses the same rule against current data.

## Delivery queue

The queue deduplicates by feed, source URL, item ID, channel, and destination. Each job carries the message and its current outcome. Claiming due work records the attempt, and updates from an older attempt cannot overwrite a newer one. On startup the worker can recover interrupted attempts as pending. A send accepted just before an interruption can be retried.

`GET /api/admin/deliveries` returns `{deliveries}` with up to 100 jobs, most recently queued first. Each record includes `id`, `title`, `publisher`, `status`, `attemptCount`, and `lastError`. The two admin endpoints require the admin role.

The email channel sends a plain-text alert with the headline as subject and the headline, topic, source, and optional item URL in the body. It reports success, retryable failure, or permanent failure without storing SMTP response text. With Mailpit running, set `TEST_MAILPIT_URL=http://127.0.0.1:18025` and run the backend tests to include the real SMTP and inbox check.

The API process checks for due deliveries once per second. The worker cancels a job whose recipient no longer matches the subscription rules. It retries temporary failures up to five total attempts with exponential backoff starting at five seconds, and records permanent failures immediately. The local SMTP defaults are `127.0.0.1:11025` and sender `alerts@example.test`. Change them with `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM`.

## Replay and checkpoints

The first successful poll establishes a baseline without queueing email. For the fake feed, later polls freeze the latest timestamp as the upper bound and commit each page's jobs and checkpoint in one SQLite transaction. Restarting an enabled fake feed continues from its last committed page.

For a public feed, SQLite keeps the item ID fingerprints from the latest nonempty snapshot alongside the feed settings. Each new snapshot and any delivery jobs commit together. Comparing identities handles out-of-order entries and several items with the same timestamp. Dated entries use their publication time for subscription matching, and undated entries use their first observed time. Catch-up is limited to items still exposed by the publisher. The app keeps no article archive.

The API process checks for due feeds once per second and runs one shared polling cycle per due feed. It saves attempt and success times and the latest error. Failed cycles retry after five seconds, doubling the delay up to five minutes. Disabling a feed or changing its URL invalidates in-flight results. Run one API process per demo database.

## Extension points

The feed poller accepts a source factory. A new source can return normalized events using a snapshot or its own timestamp and page replay protocol. The worker accepts a map of delivery channels. To add Slack, register an adapter that sends the shared alert payload and reports the send outcome, then add destination resolution and eligibility for Slack subscriptions. The queue already stores the channel and destination with each job.
