# Frontend development

Install, build, test, and serve the Angular application with Node.js 24.15 or later in the Node 24 release line.

```powershell
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
pnpm --dir frontend test --watch=false
pnpm --dir frontend start
```

Open `http://127.0.0.1:4200`. Angular uses standalone components and route configuration. The Angular CLI runs unit tests with Vitest.

The development server proxies `/api/**` to `http://127.0.0.1:3000`. The session client calls the API on the same origin and keeps only the current account in memory. The browser manages the session cookie. A failed current-account lookup with HTTP 401 clears the account, while other failures remain available to callers.

The subscriptions client lists available topics and current-account subscriptions, and sends topic and status changes through the API. API errors retain their public code and message for form feedback. Network errors and unexpected response bodies use a fallback message.

The admin feeds client lists configuration and poll health, creates trusted feeds, and sends partial updates for settings and toggles. Duplicate URL failures carry the API's validation code.

The admin deliveries client reads recent jobs with typed status and attempt summaries. It propagates access and network failures for the page to display.

The sign-in page uses Signal Forms. The shell shows navigation for the current account role, and route guards look up the current account before opening a protected page. A protected API response with HTTP 401 returns the user to sign-in and explains the expired session.

The subscriptions page shows the provisioned email, topic, current status, and activation time in UTC. Add and edit use a topic dialog. Pause and resume apply immediately, and removal asks for confirmation. Existing subscriptions remain visible when no feed offers their topic.

The RSS feeds page lets admins add, edit, enable, and disable feeds. It refreshes poll health every five seconds while open and shows the last success, failed attempt details, and next poll time in UTC.

The deliveries page refreshes while open and displays the latest headline, source, delivery status, attempt count, and last error. Pending jobs with earlier attempts are shown as retrying.

## Browser tests

With Mailpit running, install Chromium once with `pnpm --dir frontend exec playwright install chromium` and run `pnpm --dir frontend e2e`. To use a supported Microsoft Edge installation, set `TEST_BROWSER_CHANNEL=msedge`. The tests build Angular, start the API and fixture on loopback addresses, and use a separate SQLite file and unique mailbox addresses. Set `TEST_SMTP_PORT` or `TEST_MAILPIT_URL` to override the local Mailpit defaults.

The suite covers the automatic browser demo, multi-page restart recovery, strict activation, SMTP retry across a second restart, overlap deduplication, a fresh baseline after re-enable, and no email while paused or after removal. It also checks admin feed edits, duplicate URL feedback, and the UI response when a protected request loses its session. Controlled clocks advance the fake feed without waiting for wall-clock minutes.

The additional scenarios verify shared RSS polling across multiple feeds and subscribers (E1), a browser topic edit and its activation cutoff (E2), recovery after an RSS replay page returns HTTP 503 (E3), cancellation of a queued retry after pause or removal (E5), and subscription ownership and admin permissions over HTTP (E7). The test feed endpoints record actual RSS requests so the tests can check replay cursors and polling frequency.

Angular and its CLI are pinned to 22.3.0. On Windows x64, pnpm reports a peer warning in an optional WebAssembly fallback from Angular's build tooling. The native dev server, production build, and unit tests ran successfully on Node 24.22.1. [Angular version compatibility](https://angular.dev/reference/versions)
