# STATE - TrafficLab (web app factory)

> The factory resumes from this file. Resume phrase: «کارخانه وب اپ: ادامه» (skill `webapp-factory`).

## Where we are
- Stage: 5-ship done: pushed to GitHub and **deployed**: https://trafficlab-ten.vercel.app (Vercel project `trafficlab`, team saber11; Neon created through the Vercel integration)
- Created 2026-10-31. Depth **deep** (score 5: auth, PII-like data, size).
- Baseline commit `acfb9ef` (builder output, only `.gitignore` changed).  Builder: Google AI Studio.

## Inputs
- Spec: master prompt in `New Microsoft Word Document.docx` (root, git-ignored; not published). Register: `TRACE.md`.

## Durable authorizations (user words, dated)
- 2026-10-31: user gave the GitHub repository https://github.com/sabernaseralavi-60/Traffic-Data-Collection-Platform (empty, PUBLIC) and asked to audit, fix and build -> normal pushes to `main` at green points allowed.
- 2026-10-31: user asked me to deploy and set up Neon myself and to give a permanent URL -> Vercel (free) + Neon (free, Vercel integration) authorised; no paid resources or custom domain.

## Decisions (why, not only what)
| Date | Decision | Alternatives | Reason |
|---|---|---|---|
| 2026-10-31 | Keep React+Express+Python (no Next.js/FastAPI rewrite) | rewrite per spec | no correctness gain; time; container host instead of Vercel (F-023) |
| 2026-10-31 | PostgreSQL via `pg`, embedded PGlite for local/tests | SQLite | spec asks Postgres; one dialect; PGlite verified in earlier project |
| 2026-10-31 | Own migration runner (TS modules) | Alembic | server is TypeScript; fewer moving parts |
| 2026-10-31 | Observers cannot delete; undo = soft delete (10 min) | hard delete | spec: immutable events |
| 2026-10-31 | Match "confidence" renamed "match score", graded, max 95 | keep % confidence | not a probability; v0 saturated at 99 for every pair |
| 2026-10-31 | Portrait of Dr. Mazaheri NOT committed to the public repo; UI shows initials when the file is absent | commit it | personal photo in a public repo needs the person's consent (owner decides) |
| 2026-10-31 | Demo data only in dev or SEED_DEMO=true; labelled DEMO | seed always | honesty (F-017) |
| 2026-10-31 | First production start requires ADMIN_PASSWORD and SESSION_SECRET (fail closed) | defaults | no default credentials |

## Open questions that really need the owner
- Custom domain (optional), and whether the owner wants the demo accounts removed before real data is collected.
- The photo and the municipality wording (F-022): confirm authorisation before the repo is shared widely.
- Gemini key: not used by the app any more (AI is optional per spec); nothing to configure.

## Next steps
1. Owner tests the live URL and reports defects/ideas (this is the current step).
2. Before real data: set SEED_DEMO off, change passwords, decide retention, enable Neon backups/branching policy.
3. Calibrate the matching heuristic with real data; add collision-risk estimate.
