# Backend development

Install and run the API from the repository root with Node.js 24 and pnpm.

```powershell
pnpm --dir backend install --frozen-lockfile
pnpm --dir backend test
pnpm --dir backend start
```

The server listens on `127.0.0.1:3000` by default. Set `API_PORT` to change the port. `GET /api/health` returns HTTP 200 and `{"status":"ok"}` when the API can serve requests.

The server opens `backend/data/alerts.sqlite` by default. Set `ALERTS_DB_PATH` to use a different file. The app closes its database when Fastify shuts down. In-process app tests use an isolated in-memory database unless they supply a path.

Startup applies the SQL migrations under `backend/src/migrations/` in order. SQLite records the applied version in `PRAGMA user_version`. If a migration fails, SQLite rolls back its changes and API startup fails.

## Demo accounts

Set `DEMO_ADMIN_PASSWORD` and `DEMO_USER_PASSWORD` to local demo secrets of 12 to 128 characters, then run `pnpm --dir backend seed`. The default emails are `admin@example.test` and `user@example.test`. Override them with `DEMO_ADMIN_EMAIL` and `DEMO_USER_EMAIL`. The seed applies migrations and creates both accounts with salted scrypt hashes. Rerunning it preserves existing accounts and passwords. Use the same `ALERTS_DB_PATH` for seeding and the server.

## Fake RSS

Run `pnpm --dir backend fake-rss` in a separate terminal. By default it serves `http://127.0.0.1:18080/rss.xml`. Set `FAKE_RSS_PORT` to change the port. The base URL returns the latest UTC minute headline, such as `News 2026-11-23T09:02:00.000Z`. Supplying both `after` and `through` as UTC minute timestamps returns up to 100 items in publication order. The lower bound is exclusive and the upper bound is inclusive.

The RSS adapter exposes `latest()` for the publication timestamp or an empty snapshot, and `page(after, through)` for normalized articles containing an ID, title, optional URL, and publication timestamp. The adapter rejects failed requests, redirects, malformed documents, and incomplete or unordered fixture pages. It has no access to subscriptions or delivery channels.

The feed store accepts only configured fixture URLs and enforces a unique normalized URL. An enabled feed defaults to a 300-second interval and is initially due immediately. Changing the interval reschedules the next poll and keeps the article checkpoint. Re-enabling or replacing the URL clears the baseline and prior poll health.
