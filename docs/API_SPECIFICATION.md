# API specification (v1)

Base path `/api/v1`, JSON, cookie session (`tl_session`, HttpOnly). All writes need the header `X-TL-CSRF: 1`.
Errors: `{ "error": "...", "code": "..." }` (validation errors add `issues: [{path, message}]`). Roles: A = ADMIN, S = SUPERVISOR, O = OBSERVER.

| Method and path | Role | Purpose |
|---|---|---|
| `POST /auth/login` | public (30/15 min/IP; 5 failures lock the account 15 min, each further lock twice as long, max 24 h) | `{username,password}` -> sets cookie |
| `POST /auth/logout` | any | clears cookie |
| `GET /auth/me` | any | user + own assignments |
| `POST /auth/change-password` | any | `{current_password,new_password}` |
| `GET/POST /users`, `PATCH /users/:id` | A (GET also S: observers only) | accounts, activate, reset password, role, rename (`username`, 2-32 chars); minimum password length OBSERVER 2 / SUPERVISOR 4 / ADMIN 6 |
| `GET /categories`, `POST /categories`, `PATCH /categories/:code` | any / A / A | configurable vehicle categories |
| `GET /studies`, `POST /studies` | any (observer: assigned only) / A | list, create |
| `GET/PATCH/DELETE /studies/:id` | visible / A / A | detail (points, routes, assignments), update (name, times, status, retention, audio on/off), delete (no data unless demo) |
| `POST /studies/:id/maps`, `PATCH/DELETE /studies/:id/maps/:mapId` | A | map sections of a study (name, image data URL PNG/JPG/SVG <= 1 MB; max 8; the last one cannot be deleted; points of a deleted section move to the first remaining one) |
| `GET /studies/:id/maps/:mapId/image` | visible | the map image as binary (never inlined in JSON; sandboxing CSP header) |
| `PUT /studies/:id/points` | A | points + route distances (points in use cannot be removed or change type) |
| `PUT /studies/:id/assignments` | A | observer -> point (+ optional period) |
| `POST /observations` | O | record one observation (point/observer from assignment); `plate_suffix` may be **omitted when a valid voice clip is sent** (voice-only passage, digits added later; `empty_passage` otherwise); optional `audio_b64`, `audio_mime`, `audio_ms` (clip <= 200 KB decoded; a bad or oversized clip is dropped, the sighting is kept) |
| `POST /observations/batch-sync` | O | up to 500; response lists every item: `created`, `duplicate` or `rejected` + reason |
| `GET /studies/:id/observations` | visible (observer: own) | non-voided observations |
| `GET /observations/:id/audio` | A, S, O (own) | the voice clip of a passage (`audio/webm`, `ogg`, `mp4`, `mpeg` or `wav`) |
| `POST /observations/:id/correct` | A, S | `{plate_suffix, reason, source: SUPERVISOR\|SUGGESTION}`: for a typed passage voids it and creates a new one with the same time, point, observer and clip; for a voice-only passage it adds the digits **in place** |
| `POST /observations/:id/suggestion` | A, S | `{suffix, source, confidence}` stored by the offline tool `tools/transcribe_clips.py`; changes nothing until accepted via `correct` |
| `POST /observations/:id/void` | O own within 10 min, A/S any | soft delete (event kept, who/when/why stored) |
| `POST /studies/:id/match` | A, S | engine report: summary, matches, ambiguous, unmatched, OD, travel-time stats, route speeds, counts. Body: travel-time window, `strict_category_match`, `interval_minutes`, `filters {from,to,categories,points}` |
| `POST /studies/:id/reviews` | A, S | `{entry_observation_id, exit_observation_id, decision: REVIEWED\|REJECTED\|CLEAR, note}` |
| `GET /studies/:id/export.csv`, `export.xlsx` | A, S | validated records (query: `min`,`max`,`strict`,`interval`) |
| `POST /studies/:id/seed-scenario` | A | reset the synthetic DEMO study only |
| `GET /audit` | A | audit log |
| `GET /healthz` (no prefix) | public | database + engine status |

Rejection codes for observations: `invalid_suffix`, `not_assigned`, `wrong_point`, `point_required`, `study_not_active`,
`future_timestamp`, `outside_period`.
