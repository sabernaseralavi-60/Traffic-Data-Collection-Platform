# SCORECARD - TrafficLab

Scores 0-10 with evidence. "Before" = baseline `acfb9ef` by code reading (the baseline was not run in a browser); "After" = this commit with tests.

| Dimension | Before | After | Evidence | Weakest point |
|---|---|---|---|---|
| Spec coverage (TRACE) | ~4/10 (many modules absent) | 8/10 | TRACE.md: 36 met, 8 partial, 1 missing, 1 waived | PDF only via browser print; no plugin framework; point filter UI |
| Correctness and tests | 3/10 (5 py + 3 ts tests, TZ bug) | 8/10 | 28 py, 26 API, 3 unit, 18 browser tests | no real field data; no load test |
| Security and access control | 1/10 (no auth) | 8/10 | F-001,002,006,014 fixed; role-matrix test | no external pen-test; HTTPS proxy path untested |
| Honesty of data/claims | 3/10 | 8/10 | demo labelled, score renamed, compliance claims removed | owner-supplied manual text (F-022) kept as supplied |
| UX, RTL, mobile, a11y | 6/10 | 7/10 | screenshots viewed | no automated a11y audit; voice untested on device |
| Performance and resilience | 3/10 | 6/10 | offline tested; engine time-boxed | no load/volume test; matching is O(n) per suffix, fine for thousands, not measured |
| Operations (CI, deploy) | 2/10 | 8/10 | CI green, Docker build in CI, live Vercel+Neon deployment with health check and live e2e | no monitoring/alerts, no backup policy configured, single environment |
| Documentation | 5/10 (claimed more than built) | 8/10 | README, ARCHITECTURE, API, DB, GUIDE, DEPLOY, STATUS | OPEN_SOURCE_RESEARCH.md from the builder is unverified |

Overall: **7.5/10 for a production pilot** - capped by "no field data / matching score uncalibrated / no load test".
