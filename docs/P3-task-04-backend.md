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
