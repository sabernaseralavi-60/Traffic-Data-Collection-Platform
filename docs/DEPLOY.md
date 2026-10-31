# Deployment

The app is one long-running Node process that also launches Python for the analysis, so it needs a **container host**
(Cloud Run, Render, Fly.io, Railway, a VPS) rather than Vercel serverless functions. Check each host's current free tier
and limits before choosing; none is assumed here.

## Environment
See [.env.example](../.env.example). Minimum for production:

| Variable | Notes |
|---|---|
| `SESSION_SECRET` | >= 32 random characters (the server refuses to start without it) |
| `ADMIN_PASSWORD` | used once, when the database has no users (the server refuses to start without it) |
| `DATABASE_URL` | managed PostgreSQL (e.g. Neon). Without it an embedded database is written to `DATA_DIR` - only for a single instance with a persistent disk |
| `PYTHON_BIN` | default `python3` (set by the Dockerfile) |

Do **not** set `SEED_DEMO=true` on a real deployment (demo accounts have a known purpose, not a secret password policy).

## Container
```bash
docker build -t trafficlab .
docker run -p 8080:8080 -e SESSION_SECRET=... -e ADMIN_PASSWORD=... -e DATABASE_URL=... trafficlab
```
Health check: `GET /healthz` (reports database and engine). The server applies migrations at start (serialised by an
advisory lock) and creates the first administrator only when there are no users.

## Neon notes
Use the pooled or direct connection string; migrations run in one transaction with a transaction-scoped advisory lock, which is
safe over a transaction pooler. TLS is negotiated through the `sslmode` in the URL.

## After deploying
Open the URL, sign in as the administrator, change the password, create accounts, then check `GET /healthz`.
Record the live URL, commit and date in `docs/factory/VERIFIED.md`; keep the previous deployment id for rollback.
