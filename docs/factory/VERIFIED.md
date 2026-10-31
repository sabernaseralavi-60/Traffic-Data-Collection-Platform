# VERIFIED - what is and is not verified (2026-10-31)

| Claim / capability | How it was verified | Where | Not verified (limit) |
|---|---|---|---|
| Authentication, RBAC, lockout, CSRF header, tamper-proof cookie | 26 API tests incl. role-matrix replay | in-process server + PGlite | not tested behind a real HTTPS proxy (secure cookie, trust proxy) |
| Acceptance scenario (387 E01->X01, 250 s, 36 km/h, OD, same-suffix ambiguity, review, exports) | API test + browser test | PGlite + real Python engine | - |
| Offline record -> sync; offline app shell | Playwright (Chromium, mobile + desktop, 18 tests) | production build served locally | real flaky mobile networks; iOS Safari (IndexedDB/SW quirks) not tested |
| Engine correctness | 28 Python tests (synthetic data) | local | **no real field data**; heuristic score uncalibrated |
| Production bundle starts with production dependencies only; first start creates only the admin; CSP/helmet headers | manual run in a clean directory (`npm ci --omit=dev`) | local, port 3299 | **Docker image not built locally** (Docker Desktop not running); built by CI on Linux |
| PostgreSQL migrations | PGlite locally; **Neon** (live) applied `001_init` and all API/browser flows pass on it | local + live | pooled-connection behaviour is only what the e2e exercised |
| Voice input (Persian) | digit-parser unit tests | local | Web Speech API cannot run headless; needs a phone test |
| Screens look right | screenshots viewed (mobile + desktop, EN + FA) | e2e/screenshots | no automated accessibility audit |
| Map sections, person per point, voice clip per passage, correction | 39 API tests (maps, clip storage/permissions/limits, correction, PATCH regression), 20 browser tests locally and **live** (incl. recording with a fake microphone, playback and correction by the supervisor); migration 002 applied on Neon | local + live | **real microphones and speech recognition on phones untested**; Safari/iPhone untested |
| Voice-only mode, unsent clips kept, offline digit extraction | 45 API tests, 36 Python tests, 22 browser tests locally and **live**; offline pipeline (PyAV decode, Vosk small Persian model with digit grammar, rule-based parser) measured on **32 clean synthetic Persian utterances: 31 exact, 1 no-digits, 0 wrong** | local + live | **no real field audio**: real accuracy unknown (use `--verify`); the tool is not run by the server |
| Live deployment (Vercel + Neon) | `GET /healthz` = `{ok:true, database:"pg", engine:"ok"}`; direct call of `/api/engine` without token = 403; unauthenticated API = 401; **all 18 browser tests passed against https://trafficlab-ten.vercel.app** (mobile + desktop, offline sync, exports, RTL); test data removed afterwards | live, 2026-10-31 | single region/instance behaviour only; no load test; not tried on iOS Safari; Vercel free-plan limits (invocations, 4.5 MB body) not stress-tested |
| Response times (live, demo data) | login 1.0 s, matching 1.0-1.1 s (warm), CSV 1.2 s, XLSX 2.6 s, healthz 2.1 s | live | measured from one workstation |

## External services
None used (no maps, SMS, payments, AI).
