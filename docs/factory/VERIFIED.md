# VERIFIED - what is and is not verified (2026-10-31)

| Claim / capability | How it was verified | Where | Not verified (limit) |
|---|---|---|---|
| Authentication, RBAC, lockout, CSRF header, tamper-proof cookie | 26 API tests incl. role-matrix replay | in-process server + PGlite | not tested behind a real HTTPS proxy (secure cookie, trust proxy) |
| Acceptance scenario (387 E01->X01, 250 s, 36 km/h, OD, same-suffix ambiguity, review, exports) | API test + browser test | PGlite + real Python engine | - |
| Offline record -> sync; offline app shell | Playwright (Chromium, mobile + desktop, 18 tests) | production build served locally | real flaky mobile networks; iOS Safari (IndexedDB/SW quirks) not tested |
| Engine correctness | 28 Python tests (synthetic data) | local | **no real field data**; heuristic score uncalibrated |
| Production bundle starts with production dependencies only; first start creates only the admin; CSP/helmet headers | manual run in a clean directory (`npm ci --omit=dev`) | local, port 3299 | **Docker image not built locally** (Docker Desktop not running); built by CI on Linux |
| PostgreSQL migrations | PGlite (PostgreSQL 17 in WASM) | local | **not run against Neon / a real PostgreSQL server**; pooled-connection behaviour unverified |
| Voice input (Persian) | digit-parser unit tests | local | Web Speech API cannot run headless; needs a phone test |
| Screens look right | screenshots viewed (mobile + desktop, EN + FA) | e2e/screenshots | no automated accessibility audit |
| Live deployment | - | - | **none yet** |

## External services
None used (no maps, SMS, payments, AI).
