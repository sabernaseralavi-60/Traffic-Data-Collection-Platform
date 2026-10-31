# Database schema

Source of truth: [server/migrations/001_init.ts](../server/migrations/001_init.ts). PostgreSQL; UUID primary keys, foreign
keys, check constraints, indexes, `timestamptz` everywhere.

| Table | Purpose / key constraints |
|---|---|
| `users` | username (unique, lowercase), role (ADMIN/SUPERVISOR/OBSERVER), scrypt hash, `active`, `token_version` (bump = sign out everywhere), failed-login counter + lock |
| `studies` | name, date, start/end time, **timezone**, status DRAFT/ACTIVE/COMPLETED, schematic image (data URL), `is_demo`, `retention_days` |
| `study_maps` | map sections of a study (name, image data URL, order); `observation_points.map_id` places a point on one |
| `observation_points` | unique `(study_id, code)`, ENTRY/EXIT, position in % of the map |
| `route_distances` | metres between an entry and an exit point (speed is shown only where this exists) |
| `study_assignments` | observer -> point, optional period; deleting a point that is assigned is blocked |
| `vehicle_categories` | configurable list (code, EN/FA label, active) |
| `observations` | **immutable events** (optional `audio` bytea + `audio_mime` + `audio_ms`; no audio is stored when the study has `audio_enabled = false`): `plate_suffix char(3)` text with `^[0-9]{3}$` check (leading zeros valid), `observed_at` (original time), `received_at`, observer, point; unique `(observer_id, idempotency_key)`; `voided_*` columns instead of deletion |
| (observations, voice-only) | `plate_suffix` is NULL for a passage recorded by voice alone (a CHECK requires digits or a clip); `suffix_source` TYPED/VOICE/SUPERVISOR/SUGGESTION; `suggested_suffix/source/conf/at` hold the offline tool's suggestion |
| `match_reviews` | supervisor decisions REVIEWED / REJECTED per (entry, exit) pair |
| `audit_logs` | who did what (logins, configuration, voids, reviews, exports, purges) |
| `schema_migrations` | applied migrations |

Not implemented from the suggested list: separate `roles`, `study_areas`, `observation_sessions`, `study_configurations`
tables (their content lives in `users.role`, `studies`, `study_assignments`); no Alembic (the project uses its own
migration runner because the server is TypeScript).
