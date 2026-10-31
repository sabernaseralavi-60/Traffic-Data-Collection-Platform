# Architecture

## Decision record
The specification recommended Next.js + FastAPI + Neon + Vercel. The first build (Google AI Studio) delivered
React + Vite + Express with a Python process for the calculations. The audit kept that stack because replacing it
would not improve correctness and would delay delivery; the requirements that mattered were met inside it
(Python for all engineering calculations, PostgreSQL, offline-first PWA, RBAC). Consequence: the Express server
is long-running, so it is deployed on a **container host** (see DEPLOY.md), not on Vercel serverless functions.

## Components
```
Browser (React, PWA, IndexedDB queue) --HTTPS/JSON--> Express (server/)
                                                         |-- SQL --> PostgreSQL (DATABASE_URL) or embedded PGlite (DATA_DIR)
                                                         '-- stdin/stdout JSON --> Python engine (backend/trafficlab_engine.py)
```
* **UI (`src/`)** - interaction, presentation, form validation, local storage, API calls. No traffic calculations.
* **Server (`server/`)** - authentication (scrypt password hashes, HMAC-signed HttpOnly session cookie, lockout),
  role checks on every route, zod validation, SQL, audit log, retention job, CSV/XLSX export, engine bridge
  (time-boxed, bounded parallelism, errors never leak internals).
* **Engine (`backend/`)** - pure functions: matching, ambiguity detection, supervisor reviews, OD matrix, travel-time
  statistics, route speeds, counts by point/category/interval, filters, CSV. Independent of the database.
* **Database** - one SQL dialect, two drivers: `pg` for managed PostgreSQL, PGlite (embedded) for local/single-instance use.
  Migrations are TypeScript modules in `server/migrations/`, applied in order inside transactions and recorded in
  `schema_migrations`.

## Security model
* Roles: ADMIN (configuration, accounts), SUPERVISOR (matching, review, reports, voiding), OBSERVER (record at own point).
* The observer, point and point type of every observation are derived on the server from the session and the
  assignment; request bodies cannot override them.
* State-changing requests require the `X-TL-CSRF: 1` header (cannot be sent cross-site without a CORS preflight, which is never granted) on top of `SameSite=Lax`.
* Helmet headers and a strict CSP in production; login rate limit plus per-account lockout; request size limits.
* No full plate numbers are collected; observations are never public; configurable retention per study.

## Time
Instants are stored as `timestamptz` (UTC). Each study has a time zone (default `Asia/Tehran`); the UI and exports show
local time in that zone. The engine reads zone-less timestamps as UTC (never the server's zone).

## Offline behaviour
The service worker caches the static shell (never `/api`), so the app opens without a connection. Observations made
offline are stored in IndexedDB with the **original** time and the recording user; on reconnection they are sent in
batches with idempotency keys; the server answers per item (created / duplicate / rejected). Rejected items stay
visible as errors on the device. Items of another account are never uploaded under the current session.

## Extension points
New survey types (turning movements, parking occupancy, ...) can add their own observation tables and engine
actions beside the entry-exit module; the observation, assignment, audit and export code is reusable. Not implemented yet.
