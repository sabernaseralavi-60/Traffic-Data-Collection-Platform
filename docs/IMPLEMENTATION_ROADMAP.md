# Status and roadmap

Status of each part of the specification, after the audit and rebuild (2026-10-31). "Tested" means an automated test
in this repository exercises it (`npm test`, `npm run e2e`); the audit trail is in `docs/factory/`.

| Spec item | Status | Evidence / limit |
|---|---|---|
| Accounts, RBAC, secure auth, audit log | Done, tested | API tests: role matrix replay, lockout, tampered cookie, CSRF header |
| Study + points + schematic upload + route distances | Done, tested | API + browser test; image types PNG/JPG/SVG <= 1 MB, stored in the database |
| Observer assignment (point, optional period) | Done, tested | forged point/observer rejected; period slack 5 min |
| Mobile recording (keypad, voice, categories, duplicates, immutable events) | Done, tested (voice: Web Speech API only where the browser supports it; not testable headless) | exactly 3 digits; undo = soft delete |
| Offline-first + sync + PWA shell | Done, tested | browser test: offline record, auto sync, offline shell reload; items are per-user, per-item results |
| Matching engine (Python), ambiguity, review (REVIEWED/REJECTED) | Done, tested | 28 Python tests + API/browser tests; heuristic score, not a probability |
| OD matrix, travel time stats, speed, counts by point/category/interval, filters | Done, tested | filters: time window, categories (point filter exists in the engine, no UI) |
| Dashboard KPIs and charts | Done (simple SVG/CSS bars) | volume per interval, categories, points; OD heatmap on its page |
| Export Excel, CSV | Done, tested | XLSX has 7 sheets; CSV neutralises formula injection |
| Export PDF | Partial | browser *Print / Save as PDF* of the report page; no server-side PDF |
| PostgreSQL + migrations + synthetic seed | Done, tested on embedded Postgres (PGlite) | **not yet run against Neon**; own migration runner instead of Alembic |
| Retention periods | Done (daily/6-hourly job), unit-level only | no automated test of the purge job |
| Concurrency | Partial | idempotent inserts and unique keys; no load test |
| Deployment | Dockerfile + CI prepared | see DEPLOY.md; live URL recorded in `docs/factory/VERIFIED.md` once deployed |
| Plugin architecture for other surveys | Not implemented | extension points described in ARCHITECTURE.md |
| Interactive map (OpenStreetMap/Leaflet) | Not implemented (spec: future) | |

## Next priorities
1. Run against Neon and record the result; deploy to a container host.
2. Calibrate the matching heuristic with real field data and add a collision-risk estimate (expected number of
   same-suffix vehicles in the window) to each match.
3. Point filter in the UI, server-side PDF, load test with many simultaneous observers.
