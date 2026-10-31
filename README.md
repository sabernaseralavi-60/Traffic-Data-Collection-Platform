# TrafficLab - Traffic Data Collection Platform

Field data collection for transportation studies: observers record the last three digits of passing vehicles at
**entry** and **exit** points of a study area (works offline), a Python engine matches them into *probable journeys*,
and supervisors get an origin-destination matrix, travel times, average journey speeds, counts and exports
(Excel, CSV, printable PDF report). Persian (RTL) and English. AI is never required.

> Three-digit plate suffixes are **not unique identifiers**. Results are probable journeys; ambiguous cases are never
> forced and need supervisor review. The "match score" is a heuristic ranking, not a probability.

## Quick start (local)

Requirements: Node.js 22+, Python 3.10+.

```bash
npm install
cp .env.example .env        # optional in development
npm run dev                 # http://localhost:3000
```

On first start in development an embedded database is created in `data/` with a synthetic **DEMO** study and accounts
`ad` (administrator), `sv` (supervisor), `e1`, `e2`, `x1`, `x2` (observers at E01, E02, X01, X02), all with password `demo-1234` (or `SEED_PASSWORD`). Demo data is clearly labelled
and can be reset by the administrator.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | server + Vite dev middleware |
| `npm run build` / `npm start` | production build (`dist/`) and server (`dist/server.mjs`) |
| `npm run lint` | TypeScript check |
| `npm test` | API/unit tests (Vitest, in-memory Postgres) + Python engine tests |
| `npm run e2e` | browser tests (Playwright, mobile + desktop; needs `npm run build` first) |

## Live instance (pilot)
https://trafficlab-ten.vercel.app - Vercel (Node API function + Python engine function + static UI) with a Neon PostgreSQL
database. It contains a labelled **DEMO** study; accounts are given to testers by the administrator.

## Production

Set `SESSION_SECRET`, `ADMIN_PASSWORD` and (recommended) `DATABASE_URL` - see [.env.example](.env.example) and
[docs/DEPLOY.md](docs/DEPLOY.md). A [Dockerfile](Dockerfile) packages Node and the Python engine together.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [API](docs/API_SPECIFICATION.md) · [Database](docs/DATABASE_SCHEMA.md) ·
[User guide](docs/USER_GUIDE.md) · [Full guide (Word, Persian)](docs/TrafficLab_User_Guide_FA.docx) · [Deployment](docs/DEPLOY.md) · [Roadmap and status](docs/IMPLEMENTATION_ROADMAP.md)

## Layout

```
server.ts            entry (dev: Vite middleware; prod: static files)
server/              Express app: auth, RBAC, validation, SQL, engine bridge, exports, migrations
backend/             Python engine (matching, OD, statistics, CSV) + tests
src/                 React UI (no business logic: it displays what the server and engine return)
e2e/                 Playwright browser tests
```
