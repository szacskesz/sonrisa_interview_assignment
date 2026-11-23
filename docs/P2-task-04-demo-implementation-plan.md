# Phase 2 World Event Alerts Demo Plan

Deliver a local demo where an admin configures a fake RSS feed, a user subscribes to its topic, and real SMTP mail appears in Mailpit. The [Phase 1 design](P1-task-04-alerts-feature-design.md) defines scope. The proof of concept is a separate Node program that checks feed paging, persisted recovery, and SMTP delivery before work on the API and Angular UI.

## Implementation tasks

| Order | Task | Completion check |
| --- | --- | --- |
| 1 | Create the Node and Angular projects and establish start and test commands. Add SQLite migrations and provision a demo admin and user. | Both projects start locally. The API opens a persistent database and can distinguish admin, regular user, and unauthenticated requests. |
| 2 | Add RSS configuration and the fake Node.js feed. Implement the scheduler, source adapter, and checkpoint transactions. | An admin adds an allowed URL and updates its interval. A single scheduler fetches the due feed, establishes its baseline, catches up after downtime, and retains progress across restart. |
| 3 | Implement subscriptions, matching, delivery jobs, retries, and the SMTP adapter. | A new headline creates an email for eligible recipients. A forced rollback leaves the checkpoint unchanged, and persisted jobs recover after restart. |
| 4 | Add the Angular subscription and admin views. | A reviewer can sign in, manage subscriptions or feed settings as permitted, and see feed health and delivery results. |
| 5 | Complete verification and review evidence, then prepare the demo walkthrough. | Unit and browser end-to-end tests pass. Capture the changed screens and a delivered message. Run AI code review after implementation and keep human review findings in the review record. |

Use Angular CLI with standalone components, routing, and Signal Forms. Use Angular's generated unit test setup for the UI and Node's test runner for API, storage, and worker tests. Use Playwright for the browser workflow. Pin exact app dependencies at scaffolding after verifying compatibility with the Node 24 LTS runtime. The existing Angular developer skill covers implementation. The official curated Playwright skill was installed for browser verification and screenshots. [Angular compatibility](https://angular.dev/reference/versions), [Curated Playwright skill](https://github.com/openai/skills/tree/main/skills/.curated/playwright)

## Demo runtime

Run the Angular app, Fastify API and workers, and fake RSS process on the host. Docker runs Mailpit only. Use the loopback endpoints `127.0.0.1:11025` for SMTP and `http://127.0.0.1:18025` for the inbox and its API. If Docker isn't available on a reviewer's machine, the standalone Mailpit executable is a supported alternative once its configured ports match. [Mailpit Docker instructions](https://mailpit.axllent.org/docs/install/docker/), [Mailpit standalone installation](https://mailpit.axllent.org/docs/install/)

## API and access

Use JSON over the same web origin. Angular uses the API for all settings and access decisions stay on the server. Demo accounts are provisioned at setup, with password hashes stored in SQLite. Use expiring sessions and HTTP-only cookies. Validate origins for state-changing browser requests, and use secure cookies for HTTPS deployments. Serialize stable error codes for Angular forms and exclude session data and credentials from response bodies and logs.

| Routes | Contract |
| --- | --- |
| `POST /api/session`, `GET /api/session`, `DELETE /api/session` | Sign in, return the current account and role, or sign out. |
| `GET /api/topics` | List topics the user can subscribe to from enabled feeds. Existing subscriptions remain visible if their topic has no enabled feed. |
| `GET /api/subscriptions`, `POST /api/subscriptions` | List the signed-in user's subscriptions or create one from a valid topic. The destination comes from the account's provisioned email. |
| `PATCH /api/subscriptions/:id`, `DELETE /api/subscriptions/:id` | Change topic, pause, resume, or remove a subscription. Changes apply only to owned records. Creating, resuming, or changing a subscription's topic sets a new activation time. |
| `GET /api/admin/feeds`, `POST /api/admin/feeds`, `PATCH /api/admin/feeds/:id` | Inspect poll health and create, update, enable, or disable a feed. Fields are URL, publisher, topic, enabled status, and positive interval in seconds. Reject duplicate normalized URLs and restrict the demo to trusted fixture URLs provided at startup. |
| `GET /api/admin/deliveries` | List recent job outcomes with the title, source, attempt count, status, and last error. Protect the route with the admin role. |

Reject unauthenticated requests with `401` and non-admin access to admin routes with `403`. Subscription lookups outside the current user's ownership return `404`. Validate malformed configuration at the API boundary. Topic and status changes take effect on the next match or send check.

## Data and adapter contracts

| Record | Fields and invariants |
| --- | --- |
| Accounts and sessions | User ID, email, password hash, and role. Session records expire and reference a user. |
| Subscriptions | Owner, topic, activation time in UTC, and active, paused, or removed status. Retain references used for queued jobs. |
| Feed settings and state | Source ID, normalized unique URL, publisher, topic, interval, enabled flag, last attempt and success times, next due time, and the latest processed publication timestamp. Keep a separate initialization marker for an empty initial response. |
| Delivery jobs and attempts | Source and item identity, channel, destination, minimal message payload, matching subscription references, status, retry time, and attempts. Keep a unique key on source, item, channel, and destination. |

The source adapter returns validated news items and a way to fetch the next page. It has no access to users or subscriptions. Matching accepts the normalized news item and selects active subscriptions whose topic matches and whose activation time precedes the item's publication time. The worker sends through the registered channel adapter, passing a destination and common alert payload. The channel adapter reports success, retryable failure, or permanent failure. Keep RSS and SMTP details in their adapters. The demo registers only RSS and email.

Initialize a new feed from its latest valid item with no send. On later polls, fetch successive pages after the saved item timestamp through an upper bound fixed at the start of that polling cycle. Commit each page's jobs and new checkpoint atomically. A process failure resumes from that last commit. Keep older or unmatched articles out of the database. A failed SMTP send leaves a job available for retry with bounded backoff. Recheck topic, activation, and destination before attempting the send.

The fake server exposes `GET /rss.xml`. The base request returns the latest item and its timestamp. Fixture-specific query parameters `after` and `through` request a bounded chronological page after an exclusive lower bound and through an inclusive upper bound. The most recent published item from the base request provides the upper bound. The adapter uses the last timestamp in each processed page to request the next. The fake server derives items from UTC minutes, using `News 2026-11-23T09:02:00.000Z` as the title and description format and the minute as a stable ID. Production adapters must verify replay capabilities before promising complete catch-up.

## Verification and demonstration

- **Proof of concept.** Exercise real HTTP, RSS parsing, a file-backed SQLite checkpoint and jobs, and SMTP. Establish a baseline, leave more than one page of missed headlines, reopen SQLite, and confirm catch-up honors activation. Inject a rollback before committing a page, then verify recovery and repeat the poll to check for duplicates.
- **Application tests.** Cover input validation, access control, empty baseline, same-minute repeats, pages after restart, malformed items, interval edits, feed disable or URL replacement during polling, pause and resume, transient SMTP failures, and deduplication across overlapping subscriptions.
- **Browser walkthrough.** Sign in as admin, add the trusted fake feed with a 60-second interval, and verify the first poll. Sign in as a user, create a matching subscription, and confirm the next headline reaches Mailpit. Verify that its delivery status appears in admin. Use a controlled clock in automated tests. Use real minute boundaries in the manual demo.

## Proof of concept results

The [prototype under poc/phase-2](../poc/phase-2/) ran with Node 24.22.1, pnpm 11.25.0, Feedsmith 3.0.1, Nodemailer 10.6.1, and Mailpit v1.34.0. The application is still planned for Phase 3. The prototype drives polling explicitly and uses fixture subscriptions so it can test the integration without the Angular views, Fastify routes, or a live scheduler.

The run verified these behaviors:

- The first RSS poll saved the latest publication timestamp without creating jobs. A separate run of the fake server returned the expected UTC minute headline over HTTP.
- After six simulated minutes of downtime, the fixture exposed the missing headlines over three pages. An injected failure rolled back a page's jobs and checkpoint. Reopening the SQLite file recovered from the last committed page.
- Repeating the poll queued no duplicate emails. Overlapping subscriptions to the same address produced one email per headline. An unrelated topic produced no sends.
- An injected delivery failure left the jobs pending. The next pass sent real SMTP messages to Mailpit. Its API confirmed six exact subjects for the original subscriber and two for a subscriber who activated during the gap. It also confirmed the headline, topic, and source in the message body.

The first body assertion assumed Unix line endings. Mailpit's message API returned SMTP CRLF line endings. The revised assertion compares the individual lines and the full verification passed. The skill catalog helper had a certificate verification error. The official curated Playwright skill was located in the catalog repository and installed with the installer using Git and the Windows certificate store.

From the repository root, start Mailpit if the demo container is absent, then install the locked dependencies and run the check:

```powershell
docker run --detach --rm --name sonrisa-alerts-mailpit -p 127.0.0.1:11025:1025 -p 127.0.0.1:18025:8025 axllent/mailpit:v1.34.0
pnpm --dir poc/phase-2 install --frozen-lockfile
pnpm --dir poc/phase-2 verify
```

Open the [Mailpit inbox](http://127.0.0.1:18025) to inspect the test messages. For standalone Mailpit with default ports, set `POC_SMTP_PORT=1025` and `POC_INBOX_PORT=8025` before running the check. To inspect the synthetic feed separately with the system clock, run `node poc/phase-2/fake-rss.mjs` and open the [fixture endpoint](http://127.0.0.1:18080/rss.xml).
