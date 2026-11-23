# Phase 2 World Event Alerts Demo Plan

Deliver a local demo where an admin configures a fake RSS feed, a user subscribes to its topic, and real SMTP mail appears in Mailpit. The [Phase 1 design](P1-task-04-alerts-feature-design.md) defines scope. The proof of concept is a separate Node program that checks feed paging, persisted recovery, and SMTP delivery before work on the API and Angular UI.

## Implementation tasks

Each task has one reviewable outcome. Include the task's tests and public interface documentation with its change. Commit each completed task using its ID. Tasks with satisfied dependencies can start independently.

### Database design and backend setup

| ID | Task | Depends on | Completion check |
| --- | --- | --- | --- |
| P2-DB | Model the database | — | The [ER diagram](P2-task-04-database-review.md) and [SQL draft](P2-task-04-demo-schema.sql) are available for review. SQLite verified the schema. |
| P3-01 | Scaffold the Node.js project | — | Fastify starts locally and the backend test command runs. |
| P3-02 | Integrate SQLite with Node.js | P3-01 | The backend opens a configurable database file, enables foreign keys, and closes it cleanly. |
| P3-03 | Add the schema migration | P2-DB, P3-02 | The migration creates the schema on a new database and can rerun without resetting existing data. |
| P3-04 | Provision demo accounts | P3-03 | A repeatable seed command creates the admin and regular user with hashed passwords. |

### RSS, matching, and email

| ID | Task | Depends on | Completion check |
| --- | --- | --- | --- |
| P3-05 | Add the standalone fake RSS server | P3-01 | The endpoint serves one item per UTC minute and can page through missed minutes with a controlled clock. |
| P3-06 | Integrate RSS parsing and fetching | P3-05 | The adapter reads and validates ordered pages from the fake feed and reports malformed responses. |
| P3-07 | Implement feed configuration storage | P3-03 | An enabled feed's URL, topic, interval, and next poll time persist. Duplicate and untrusted URLs are rejected. |
| P3-08 | Implement subscription storage and lifecycle | P3-03 | Creation, topic changes, pause, resume, and removal persist with the proper activation time. |
| P3-09 | Implement news matching | P3-08 | A news item matches only active subscriptions for its topic that were activated before it was published. |
| P3-10 | Implement the delivery queue | P3-03 | Jobs and attempts persist. Multiple matching subscriptions can link to one job per item and destination. |
| P3-11 | Implement RSS checkpoint and catch-up | P3-06, P3-07, P3-09, P3-10 | The initial poll establishes a baseline. Each later page commits its checkpoint and jobs together, and recovery resumes at the last committed page. |
| P3-12 | Implement the automatic feed scheduler | P3-11 | One polling cycle runs per due feed. Interval edits take effect, failures back off, and disabled or replaced feeds discard in-flight results. |
| P3-13 | Integrate email over SMTP | P3-01 | A standalone adapter sends the expected message to Mailpit and classifies send failures. |
| P3-14 | Implement the delivery worker | P3-08, P3-10, P3-13 | The worker rechecks subscription eligibility, runs pending jobs, retries transient failures, and records final outcomes. |

### Node.js API for Angular

| ID | Task | Depends on | Completion check |
| --- | --- | --- | --- |
| P3-15 | Implement the session API | P3-04 | Demo accounts can sign in and out. The API resolves the current account and rejects missing or expired sessions. |
| P3-16 | Implement the topics API | P3-07, P3-15 | Signed-in users can list topics from enabled feeds. |
| P3-17 | Implement the subscriptions API | P3-08, P3-16 | A user can manage their own subscriptions. Attempts to read or change another user's subscription fail. |
| P3-18 | Implement the admin feeds API | P3-07, P3-15 | Admins can list feeds with poll health and create or update settings. Regular users are denied access. |
| P3-19 | Implement the admin deliveries API | P3-10, P3-15 | Admins can list recent jobs, attempt counts, and the latest error. Regular users are denied access. |

### Angular frontend

| ID | Task | Depends on | Completion check |
| --- | --- | --- | --- |
| P3-20 | Scaffold the Angular project | — | Angular starts, builds, and runs its base tests independently of backend scaffolding. |
| P3-21 | Integrate the session API | P3-15, P3-20 | The Angular session client handles sign-in, current-account lookup, sign-out, and session errors. |
| P3-22 | Integrate the topics and subscriptions APIs | P3-16, P3-17, P3-21 | Typed Angular clients read topics and manage subscriptions with predictable validation errors. |
| P3-23 | Integrate the admin feeds API | P3-18, P3-21 | The Angular admin client reads feed health and updates configuration. |
| P3-24 | Integrate the admin deliveries API | P3-19, P3-21 | The Angular admin client reads delivery outcomes and handles loading failures. |
| P3-25 | Build the sign-in page and protected routes | P3-21 | Demo users reach the pages for their role and signed-out users return to sign-in. |
| P3-26 | Build the user subscription page | P3-22, P3-25 | A user can create, edit, pause, resume, and remove a subscription through the page. |
| P3-27 | Build the admin feed page | P3-23, P3-25 | An admin can configure a feed and its interval, disable it, and see its poll health. |
| P3-28 | Build the admin deliveries panel | P3-24, P3-25 | The admin can see recent alerts, outcomes, attempt counts, and the latest error. |

### End-to-end tests, review, and delivery

| ID | Task | Depends on | Completion check |
| --- | --- | --- | --- |
| P3-29 | Automate the browser demo | P3-12, P3-14, P3-26, P3-27, P3-28 | Playwright proves that a feed configured in admin produces a real email for a matching user and a visible admin delivery result. |
| P3-30 | Automate recovery and eligibility scenarios | P3-29 | Controlled clocks and restart tests verify all missed items, the activation cutoff, retry, and duplicate prevention. |
| P3-31 | Run AI code review | P3-30 | Review findings are verified and recorded before the verification phase. |
| P4-01 | Run the full verification suites | P3-31 | Build, unit, and end-to-end results are recorded. Verified defects are fixed with regression tests. |
| P4-02 | Collect human review evidence | P4-01 | The review document embeds screenshots of the changed UI and shows a captured test email. |
| P4-03 | Apply and verify human review fixes | P4-02 | Any requested fixes are documented, committed separately, and checked with the relevant suites. |
| P5-01 | Write and verify the demo runbook | P4-03 | The startup and walkthrough instructions work from a fresh setup. |
| P5-02 | Prepare the submission | P5-01 | The repository includes the demo, evidence, prompt history, milestone commits, known limits, and follow-up work. |

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

See the [database review](P2-task-04-database-review.md) for the table relationships and [reviewable SQLite schema](P2-task-04-demo-schema.sql).

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
