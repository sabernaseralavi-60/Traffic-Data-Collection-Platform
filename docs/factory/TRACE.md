# TRACE - spec requirements -> evidence

Spec: master prompt in the project root (`New Microsoft Word Document.docx`, not committed). Rows are curated from the
1,007 paragraphs (the automatic extractor gave 307 lines; context lines were dropped, compound sentences split).
Status: met | partial | missing | waived. Evidence: tests unless stated.  `I` = implicit requirement added by the audit.

| ID | Spec § | Requirement | Status | Evidence |
|---|---|---|---|---|
| R-01 | 2 | Works without AI; AI never mandatory | met | no AI dependency in code (removed unused `@google/genai`); `grep` of src/server |
| R-02 | 3 | Phase-0 research document | partial | `docs/OPEN_SOURCE_RESEARCH.md` written by the builder; **repository facts not independently re-verified** by the audit |
| R-03 | 4 | Business logic and calculations in Python | met | `backend/trafficlab_engine.py`; UI only displays results |
| R-04 | 4 | Stack Next.js/FastAPI/Neon/Vercel (recommended) | waived | decision F-023 (React+Express+Python, container host), ARCHITECTURE.md |
| R-05 | 4 | Check free-tier limits (Vercel/Neon) | partial | reasoning in DEPLOY.md/ARCHITECTURE.md; live limits not re-checked this session |
| R-06 | 5 | Study with name, description, date, times, area, supervisor, observers | met | API test (study create/patch), e2e setup test |
| R-07 | 5.1 | Upload schematic PNG/JPG/SVG; view; define points with unique code, ENTRY/EXIT, description; edit positions; save | met | API test (SVG ok, script-SVG refused), e2e (create, points, drag markers exist; upload UI not driven by e2e) |
| R-08 | 5.1 | Distinct symbols for entry/exit | met | screenshot review (circle vs diamond) |
| R-09 | 6 | Individual observer accounts with name, username, password | met | API test, e2e accounts |
| R-10 | 6 | Assign study, point, period | met | API test (assignments), period slack rule in code; period rejection not unit-tested |
| R-11 | 6 | Observer clearly sees assigned point; cannot submit under another location | met | API test `wrong_point`; e2e banner |
| R-12 | 6 | Store observer, study, point with every record | met | schema NOT NULL FKs |
| R-13 | 6/15 | RBAC admin/supervisor/observer; observers limited to permitted studies/points | met | API role-matrix replay test |
| R-14 | 7 | Mobile-first, 1-2 s recording, large buttons | met (not timed) | e2e mobile screenshots; no stopwatch measurement |
| R-15 | 7.1 | Show study, point, ENTRY/EXIT, observer, time, connection status, plate input, category, voice, submit, recent | met | e2e + screenshots |
| R-16 | 7.2 | Last-3-digit suffix as text; immutable events; no overwrite | met | schema check; void = soft delete test |
| R-17 | 7.3 | Persian voice input (fa-IR), no audio to servers, preview before submit, manual correction, works without support | partial | code path + parser unit tests; **speech API not testable headless** |
| R-18 | 7.4 | Optional, configurable categories, quick buttons | met | API + e2e |
| R-19 | 7.5 | Duplicate prevention: client lock, idempotency keys, server detection, keep legitimate repeats | met | API test idempotency + repeated suffix |
| R-20 | 8 | IndexedDB offline, pending state, auto sync, no duplicates, original timestamp, status display | met | e2e offline test; API batch test (original time kept) |
| R-21 | 9 | Matching in Python with calc fields (points, times, travel time, suffix, category, confidence, status) | met | 28 Python tests, API acceptance |
| R-22 | 9.1 | Not suffix equality alone; time window; ambiguity not forced; review; statuses MATCHED/UNMATCHED/AMBIGUOUS/REVIEWED/REJECTED | met | Python + API review tests |
| R-23 | 9.1 | Matching independent of DB; unit tests with synthetic data | met | engine is pure; tests |
| R-24 | 9.2 | Report matching/ambiguous/unmatched rates; never claim certainty | met | UI text, summary `method_note`, score relabelled |
| R-25 | 10A | Entry/exit counts by point, interval, category | met | `counts` tests |
| R-26 | 10B | OD matrix with filters (date, time, category, point) | partial | matrix + time/category filters in UI; point filter engine-only; date = study date |
| R-27 | 10C | Travel time stats incl. percentiles | met | tests |
| R-28 | 10D | Average speed only when distance known; distinguish from instantaneous speed | met | `route_speeds` test; UI wording |
| R-29 | 10E | 5/15/30/60-min and custom intervals | partial | engine/API accept any 1-240 min; UI exposes the 15-min default only |
| R-30 | 10F | Vehicle composition and filtering | met | split + category filter |
| R-31 | 11 | Architecture ready for other survey types | partial | described, not implemented (spec: do not implement now) |
| R-32 | 12 | Normalised PostgreSQL, UUID PKs, FKs, indexes, tz timestamps, constraints, transactions | met | migration; PGlite tests. **Not run on Neon** |
| R-33 | 12 | UTC storage, display in study time zone | met | test (04:45:10Z for 08:15:10+03:30); UI uses zone |
| R-34 | 12 | Connection pooling; Alembic migrations; synthetic seed | partial | pg Pool; own migration runner (not Alembic); seed met |
| R-35 | 12 | Never DB credentials in frontend | met | CI bundle grep; code |
| R-36 | 13 | Modern UI, mobile-first, accessible, Persian RTL, Vazirmatn, both languages | met (a11y partial) | e2e/screenshots; labels/aria added; no automated a11y audit |
| R-37 | 13 | Pages: Login, Dashboard, Studies, Study area, Points, Observers, Collection, Matching, OD, Travel time, Reports, Settings | partial | no separate "Settings" page (categories/accounts live under Accounts) |
| R-38 | 14 | Dashboard KPIs and 6 charts (volume, category, entry dist, exit dist, OD heatmap, travel-time dist) | met | dashboard + OD page; entry/exit distribution shown as one by-point chart |
| R-39 | 14 | Export Excel, CSV, PDF from validated records | partial | XLSX, CSV tested; PDF = browser print |
| R-40 | 15 | Secure auth, audit log, retention, aggregated reporting, no public raw data, no full plates | met | tests; retention job without automated test |
| R-41 | 16 | Unit/API/DB/matching tests, validation, error handling, logging; edge cases list | met | list covered: same suffix elsewhere, repeated suffix, missing exit/entry, wrong timestamp, duplicate, offline sync, ambiguous, leading zeros; concurrency = partial |
| R-42 | 18 | No fake dashboard, no mock API in prod, no logic in React, no secrets, migrations, no unverified claims | met | scan + audit; demo data labelled |
| R-43 | 19 | Full acceptance scenario incl. offline repeat and same-suffix test | met | API acceptance test + e2e offline |
| R-44 | 20 | Deliverables: code, GitHub, docs, schema, API, research report, tests, deployment URL, guides | partial | all but the live deployment URL (pending) |
| I-01 | - | Password policy, lockout, session revocation | met | tests |
| I-02 | - | Backups of the database | missing | host/Neon feature; not configured here |
| I-03 | - | Health endpoint, graceful shutdown | met | `/healthz` test |
