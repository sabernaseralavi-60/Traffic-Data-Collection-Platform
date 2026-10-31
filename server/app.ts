import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { normalizePlateDigits } from '../src/utils/plateNormalization.ts';
import { COOKIE, csrfHeader, hashPassword, requireAuth, requireRole, sessionLoader, setSessionCookie, signSession, verifyPassword, type AuthUser } from './auth.ts';
import type { Config } from './config.ts';
import { ts, type Db, type Query } from './db.ts';
import { EngineError, engineOptions, runEngine } from './engine.ts';
import { resetDemoObservations } from './seed.ts';
import {
  assignmentsSchema, batchSchema, categoryCreateSchema, correctSchema, mapCreateSchema, mapPatchSchema, categoryPatchSchema, loginSchema, matchSchema, observationSchema, pointsSchema,
  reviewSchema, studyCreateSchema, studyPatchSchema, userCreateSchema, userPatchSchema, voidSchema, type MatchParams,
} from './validation.ts';
import { buildWorkbook } from './xlsx.ts';

const changePasswordSchema = z.object({ current_password: z.string().min(1).max(200), new_password: z.string().min(8).max(200) });
const reviewWithClear = reviewSchema.extend({ decision: z.enum(['REVIEWED', 'REJECTED', 'CLEAR']) });
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBS_COLS = `o.id, o.study_id, o.point_code, o.point_type, o.plate_suffix::text AS plate_suffix, o.vehicle_category, o.vehicle_color,
  ${ts('o.observed_at')} AS observation_timestamp, ${ts('o.received_at')} AS created_at, o.observer_id, u.full_name AS observer_name, o.idempotency_key,
  (o.audio IS NOT NULL) AS has_audio, o.audio_ms`;
const OBS_FROM = `FROM observations o JOIN users u ON u.id = o.observer_id`;
const BOM = String.fromCharCode(0xfeff);
const VOID_WINDOW_MS = 10 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code = 'error') { super(message); }
}

type Rejection = { status: 'rejected'; code: string; error: string };
type Recorded = { status: 'created' | 'duplicate'; observation: Record<string, any> } | Rejection;
const rejected = (code: string, error: string): Rejection => ({ status: 'rejected', code, error });

const AUDIO_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];
/** Decodes an optional voice clip; returns null (clip dropped) when it is missing, too large or not really audio. */
function decodeClip(input: { audio_b64?: string; audio_mime?: string; audio_ms?: number }) {
  if (!input.audio_b64) return null;
  const mime = (input.audio_mime || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_MIMES.includes(mime)) return null;
  const b = Buffer.from(input.audio_b64, 'base64');
  if (b.length < 100 || b.length > 200_000) return null;
  const ok = mime === 'audio/webm' ? b.readUInt32BE(0) === 0x1a45dfa3
    : mime === 'audio/ogg' ? b.subarray(0, 4).toString('latin1') === 'OggS'
    : mime === 'audio/mp4' ? b.subarray(4, 8).toString('latin1') === 'ftyp'
    : mime === 'audio/wav' ? b.subarray(0, 4).toString('latin1') === 'RIFF'
    : (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0));
  return ok ? { bytes: b, mime, ms: Math.min(input.audio_ms ?? 0, 30_000) } : null;
}

function validateImage(dataUrl: string): string | null {
  const m = /^data:(image\/(?:png|jpeg|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return 'Image must be a PNG, JPG or SVG data URL';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 1_000_000) return 'Image is larger than 1 MB';
  if (m[1] === 'image/png' && !(buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return 'File content is not a PNG';
  if (m[1] === 'image/jpeg' && !(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return 'File content is not a JPEG';
  if (m[1] === 'image/svg+xml') {
    const text = buf.toString('utf8');
    if (!/<svg[\s>]/i.test(text)) return 'File content is not an SVG';
    if (/<script|\son\w+\s*=|javascript:|<foreignObject|<iframe|<!ENTITY/i.test(text)) return 'SVG contains active content and was refused';
  }
  return null;
}

export function createApp(cfg: Config, db: Db) {
  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: cfg.env === 'production' ? {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"], workerSrc: ["'self'"], manifestSrc: ["'self'"], objectSrc: ["'none'"],
        mediaSrc: ["'self'", 'blob:'], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      },
    } : false,
  }));
  app.use(express.json({ limit: '2.5mb' }));
  app.use(sessionLoader(cfg, db));

  const api = express.Router();
  const q: Query = db.query;

  const limiter = (windowMs: number, limit: number) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, skip: () => cfg.env === 'test', message: { error: 'Too many requests, try again later', code: 'rate_limited' } });

  const audit = (user: Pick<AuthUser, 'id' | 'username'> | null | undefined, action: string, entity?: string, entityId?: string, detail?: unknown, query: Query = q) =>
    query(`INSERT INTO audit_logs (user_id, username, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
      [user?.id ?? null, user?.username ?? null, action, entity ?? null, entityId ?? null, detail === undefined ? null : JSON.stringify(detail).slice(0, 2000)]);

  const idParam = (req: Request) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) throw new HttpError(404, 'Not found', 'not_found');
    return id;
  };

  /** Study visible to the user, or 404 (an observer must not learn that other studies exist). */
  async function visibleStudy(user: AuthUser, id: string) {
    const rows = await q(`SELECT s.*, to_char(s.study_date,'YYYY-MM-DD') AS study_date_text FROM studies s WHERE s.id = $1`, [id]);
    const s = rows[0];
    if (!s) throw new HttpError(404, 'Study not found', 'not_found');
    if (user.role === 'OBSERVER') {
      const a = await q('SELECT 1 FROM study_assignments WHERE study_id = $1 AND user_id = $2 LIMIT 1', [id, user.id]);
      if (!a.length) throw new HttpError(404, 'Study not found', 'not_found');
    }
    return s;
  }

  async function studyDetail(user: AuthUser, s: Record<string, any>) {
    const points = await q(`SELECT id, code, map_id, point_type, description, x_percent::float8 AS x_percent, y_percent::float8 AS y_percent FROM observation_points WHERE study_id = $1 ORDER BY code`, [s.id]);
    const routes = await q(`SELECT origin_code, destination_code, distance_meters::float8 AS distance_meters FROM route_distances WHERE study_id = $1 ORDER BY origin_code, destination_code`, [s.id]);
    const assignments = await q(
      `SELECT a.id, a.user_id, u.username, u.full_name, a.point_code, ${ts('a.period_start')} AS period_start, ${ts('a.period_end')} AS period_end
       FROM study_assignments a JOIN users u ON u.id = a.user_id WHERE a.study_id = $1 ${user.role === 'OBSERVER' ? 'AND a.user_id = $2' : ''} ORDER BY a.point_code, u.username`,
      user.role === 'OBSERVER' ? [s.id, user.id] : [s.id]);
    const [{ n }] = await q('SELECT count(*)::int AS n FROM observations WHERE study_id = $1 AND voided_at IS NULL', [s.id]);
    const maps = (await q(`SELECT id, name, sort_order, (image IS NOT NULL) AS has_image, substr(md5(coalesce(image,'')), 1, 10) AS v FROM study_maps WHERE study_id = $1 ORDER BY sort_order, created_at`, [s.id]))
      .map((m) => ({ id: m.id, name: m.name, sort_order: m.sort_order, image_url: m.has_image ? `/api/v1/studies/${s.id}/maps/${m.id}/image?v=${m.v}` : null }));
    return {
      id: s.id, name: s.name, description: s.description, study_date: s.study_date_text, start_time: s.start_time, end_time: s.end_time,
      timezone: s.timezone, supervisor_name: s.supervisor_name, status: s.status, audio_enabled: s.audio_enabled, maps,
      is_demo: s.is_demo, retention_days: s.retention_days, created_at: s.created_at,
      points, routes, assignments, observation_count: n,
    };
  }

  // ------------------------------------------------------------------ health
  app.get('/healthz', wrap(async (_req, res) => {
    let dbOk = false;
    try { await q('SELECT 1'); dbOk = true; } catch { /* reported below */ }
    let engine: 'ok' | 'unavailable' = 'ok';
    try { await runEngine('report', { observations: [] }, engineOptions(cfg, 8000)); } catch { engine = 'unavailable'; }
    res.status(dbOk && engine === 'ok' ? 200 : 503).json({ ok: dbOk && engine === 'ok', database: dbOk ? db.kind : 'down', engine });
  }));

  app.use('/api/v1', limiter(15 * 60_000, 3000), csrfHeader, api);

  // ------------------------------------------------------------------ auth
  api.post('/auth/login', limiter(15 * 60_000, 30), wrap(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const rows = await q('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
    const u = rows[0];
    const fail = async () => {
      await audit(null, 'login_failed', 'user', undefined, { username: username.slice(0, 64) });
      throw new HttpError(401, 'Wrong username or password', 'bad_credentials');
    };
    if (!u || !u.active) { await verifyPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='); return fail(); }
    if (u.locked_until && new Date(u.locked_until) > new Date()) throw new HttpError(429, 'Account temporarily locked after repeated failures', 'locked');
    if (!(await verifyPassword(password, u.password_hash))) {
      await q(`UPDATE users SET
               locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
               failed_logins = CASE WHEN failed_logins + 1 >= 5 THEN 0 ELSE failed_logins + 1 END WHERE id = $1`, [u.id]);
      return fail();
    }
    await q('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [u.id]);
    const { token, maxAgeMs } = signSession(cfg, { id: u.id as string, token_version: u.token_version as number });
    setSessionCookie(res, cfg, token, maxAgeMs);
    await audit({ id: u.id as string, username: u.username as string }, 'login', 'user', u.id);
    res.json({ user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role } });
  }));

  api.post('/auth/logout', wrap(async (req, res) => {
    if (req.user) await audit(req.user, 'logout', 'user', req.user.id);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }));

  api.use(requireAuth);

  api.get('/auth/me', wrap(async (req, res) => {
    const u = req.user!;
    const assignments = await q(
      `SELECT a.study_id, s.name AS study_name, s.status AS study_status, s.timezone, s.is_demo, a.point_code, p.point_type, p.description,
              ${ts('a.period_start')} AS period_start, ${ts('a.period_end')} AS period_end
       FROM study_assignments a JOIN studies s ON s.id = a.study_id
       JOIN observation_points p ON p.study_id = a.study_id AND p.code = a.point_code
       WHERE a.user_id = $1 ORDER BY s.study_date DESC, a.point_code`, [u.id]);
    res.json({ user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role }, assignments });
  }));

  api.post('/auth/change-password', wrap(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const [u] = await q('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!(await verifyPassword(body.current_password, u.password_hash))) throw new HttpError(403, 'Current password is wrong', 'bad_credentials');
    const [{ token_version }] = await q('UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING token_version', [req.user!.id, await hashPassword(body.new_password)]);
    const s = signSession(cfg, { id: req.user!.id, token_version });
    setSessionCookie(res, cfg, s.token, s.maxAgeMs);
    await audit(req.user, 'password_changed', 'user', req.user!.id);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------------ users (admin)
  api.get('/users', requireRole('ADMIN', 'SUPERVISOR'), wrap(async (req, res) => {
    const rows = await q(
      `SELECT u.id, u.username, u.full_name, u.role, u.active, ${ts('u.created_at')} AS created_at,
              COALESCE((SELECT json_agg(json_build_object('study_id', a.study_id, 'study_name', s.name, 'point_code', a.point_code) ORDER BY s.study_date DESC, a.point_code)
                        FROM study_assignments a JOIN studies s ON s.id = a.study_id WHERE a.user_id = u.id), '[]'::json) AS assignments
       FROM users u ${req.user!.role === 'ADMIN' ? '' : `WHERE u.role = 'OBSERVER'`} ORDER BY u.role, u.username`);
    res.json(rows);
  }));

  api.post('/users', requireRole('ADMIN'), wrap(async (req, res) => {
    const b = userCreateSchema.parse(req.body);
    const [u] = await q(`INSERT INTO users (username, full_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, username, full_name, role, active`, [b.username, b.full_name, b.role, await hashPassword(b.password)]);
    await audit(req.user, 'user_created', 'user', u.id, { username: b.username, role: b.role });
    res.status(201).json(u);
  }));

  api.patch('/users/:id', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    const b = userPatchSchema.parse(req.body);
    const [cur] = await q('SELECT id, role, active FROM users WHERE id = $1', [id]);
    if (!cur) throw new HttpError(404, 'User not found', 'not_found');
    if (id === req.user!.id && (b.active === false || (b.role && b.role !== 'ADMIN'))) throw new HttpError(409, 'You cannot deactivate or demote your own account', 'self_lockout');
    if ((b.active === false || (b.role && b.role !== 'ADMIN')) && cur.role === 'ADMIN') {
      const [{ n }] = await q(`SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND active AND id <> $1`, [id]);
      if (n === 0) throw new HttpError(409, 'At least one active administrator is required', 'last_admin');
    }
    const sets: string[] = [];
    const vals: unknown[] = [id];
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.full_name !== undefined) set('full_name', b.full_name);
    if (b.role !== undefined) set('role', b.role);
    if (b.active !== undefined) set('active', b.active);
    if (b.password !== undefined) set('password_hash', await hashPassword(b.password));
    if (b.password !== undefined || b.role !== undefined || b.active === false) sets.push('token_version = token_version + 1');
    if (!sets.length) throw new HttpError(400, 'Nothing to update', 'empty');
    const [u] = await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING id, username, full_name, role, active`, vals);
    await audit(req.user, 'user_updated', 'user', id, { fields: Object.keys(b).map((k) => (k === 'password' ? 'password' : k)) });
    res.json(u);
  }));

  // ------------------------------------------------------------------ categories
  api.get('/categories', wrap(async (req, res) => {
    const all = req.query.all === '1' && req.user!.role === 'ADMIN';
    res.json(await q(`SELECT code, label_en, label_fa, sort_order, active FROM vehicle_categories ${all ? '' : 'WHERE active'} ORDER BY sort_order, code`));
  }));
  api.post('/categories', requireRole('ADMIN'), wrap(async (req, res) => {
    const b = categoryCreateSchema.parse(req.body);
    const [c] = await q(`INSERT INTO vehicle_categories (code, label_en, label_fa, sort_order) VALUES ($1,$2,$3,$4) RETURNING code, label_en, label_fa, sort_order, active`, [b.code, b.label_en, b.label_fa, b.sort_order]);
    await audit(req.user, 'category_created', 'vehicle_category', b.code);
    res.status(201).json(c);
  }));
  api.patch('/categories/:code', requireRole('ADMIN'), wrap(async (req, res) => {
    const code = String(req.params.code).toUpperCase();
    const b = categoryPatchSchema.parse(req.body);
    const sets: string[] = []; const vals: unknown[] = [code];
    for (const [k, v] of Object.entries(b)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    if (!sets.length) throw new HttpError(400, 'Nothing to update', 'empty');
    if (code === 'UNKNOWN' && b.active === false) throw new HttpError(409, 'UNKNOWN is the fallback category and cannot be disabled', 'protected');
    const rows = await q(`UPDATE vehicle_categories SET ${sets.join(', ')} WHERE code = $1 RETURNING code, label_en, label_fa, sort_order, active`, vals);
    if (!rows.length) throw new HttpError(404, 'Category not found', 'not_found');
    await audit(req.user, 'category_updated', 'vehicle_category', code, b);
    res.json(rows[0]);
  }));

  // ------------------------------------------------------------------ studies
  api.get('/studies', wrap(async (req, res) => {
    const u = req.user!;
    const rows = await q(
      `SELECT s.id, s.name, s.description, to_char(s.study_date,'YYYY-MM-DD') AS study_date, s.start_time, s.end_time, s.timezone, s.supervisor_name, s.status,
              s.is_demo, s.schematic_type, ${ts('s.created_at')} AS created_at,
              (SELECT count(*)::int FROM observations o WHERE o.study_id = s.id AND o.voided_at IS NULL) AS observation_count
       FROM studies s ${u.role === 'OBSERVER' ? 'WHERE EXISTS (SELECT 1 FROM study_assignments a WHERE a.study_id = s.id AND a.user_id = $1)' : ''}
       ORDER BY s.study_date DESC, s.created_at DESC`, u.role === 'OBSERVER' ? [u.id] : []);
    res.json(rows);
  }));

  api.post('/studies', requireRole('ADMIN'), wrap(async (req, res) => {
    const b = studyCreateSchema.parse(req.body);
    const [s] = await q(
      `INSERT INTO studies (name, description, study_date, start_time, end_time, timezone, supervisor_name, status, retention_days, audio_enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [b.name, b.description, b.study_date, b.start_time, b.end_time, b.timezone, b.supervisor_name, b.status, b.retention_days ?? null, b.audio_enabled, req.user!.id]);
    await q(`INSERT INTO study_maps (study_id, name, sort_order) VALUES ($1, 'Map 1', 0)`, [s.id]);
    await audit(req.user, 'study_created', 'study', s.id, { name: b.name });
    res.status(201).json(await studyDetail(req.user!, await visibleStudy(req.user!, s.id)));
  }));

  api.get('/studies/:id', wrap(async (req, res) => {
    res.json(await studyDetail(req.user!, await visibleStudy(req.user!, idParam(req))));
  }));

  api.patch('/studies/:id', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    await visibleStudy(req.user!, id);
    const b = studyPatchSchema.parse(req.body);
    const sets: string[] = []; const vals: unknown[] = [id];
    for (const [k, v] of Object.entries(b)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    if (!sets.length) throw new HttpError(400, 'Nothing to update', 'empty');
    await q(`UPDATE studies SET ${sets.join(', ')} WHERE id = $1`, vals);
    await audit(req.user, 'study_updated', 'study', id, { fields: Object.keys(b) });
    res.json(await studyDetail(req.user!, await visibleStudy(req.user!, id)));
  }));

  api.delete('/studies/:id', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    const s = await visibleStudy(req.user!, id);
    const [{ n }] = await q('SELECT count(*)::int AS n FROM observations WHERE study_id = $1', [id]);
    if (n > 0 && !s.is_demo) throw new HttpError(409, 'A study with observations cannot be deleted (set it to COMPLETED instead)', 'has_data');
    await q('DELETE FROM studies WHERE id = $1', [id]);
    await audit(req.user, 'study_deleted', 'study', id, { name: s.name, observations: n });
    res.json({ ok: true });
  }));

  api.put('/studies/:id/points', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    await visibleStudy(req.user!, id);
    const b = pointsSchema.parse(req.body);
    await db.tx(async (tq) => {
      const existing = await tq('SELECT code FROM observation_points WHERE study_id = $1', [id]);
      const keep = new Set(b.points.map((p) => p.code));
      for (const e of existing) {
        if (keep.has(e.code)) continue;
        const [used] = await tq(`SELECT (SELECT count(*)::int FROM observations WHERE study_id = $1 AND point_code = $2) AS obs,
                                        (SELECT count(*)::int FROM study_assignments WHERE study_id = $1 AND point_code = $2) AS asg`, [id, e.code]);
        if (used.obs > 0 || used.asg > 0) throw new HttpError(409, `Point ${e.code} has ${used.obs} observation(s) and ${used.asg} assignment(s) and cannot be removed`, 'point_in_use');
        await tq('DELETE FROM observation_points WHERE study_id = $1 AND code = $2', [id, e.code]);
      }
      for (const p of b.points) {
        const cur = await tq('SELECT point_type FROM observation_points WHERE study_id = $1 AND code = $2', [id, p.code]);
        if (cur[0] && cur[0].point_type !== p.point_type) {
          const [{ n }] = await tq('SELECT count(*)::int AS n FROM observations WHERE study_id = $1 AND point_code = $2', [id, p.code]);
          if (n > 0) throw new HttpError(409, `Point ${p.code} already has observations; its ENTRY/EXIT type cannot change`, 'point_in_use');
        }
        if (p.map_id && !(await tq('SELECT 1 FROM study_maps WHERE id = $1 AND study_id = $2', [p.map_id, id])).length) throw new HttpError(400, `Map of point ${p.code} does not belong to this study`, 'bad_map');
        await tq(`INSERT INTO observation_points (study_id, code, map_id, point_type, description, x_percent, y_percent) VALUES ($1,$2,$3,$4,$5,$6,$7)
                  ON CONFLICT (study_id, code) DO UPDATE SET map_id = EXCLUDED.map_id, point_type = EXCLUDED.point_type, description = EXCLUDED.description, x_percent = EXCLUDED.x_percent, y_percent = EXCLUDED.y_percent`,
          [id, p.code, p.map_id ?? null, p.point_type, p.description, p.x_percent, p.y_percent]);
      }
      await tq('DELETE FROM route_distances WHERE study_id = $1', [id]);
      for (const r of b.routes) await tq('INSERT INTO route_distances (study_id, origin_code, destination_code, distance_meters) VALUES ($1,$2,$3,$4)', [id, r.origin_code, r.destination_code, r.distance_meters]);
    });
    await audit(req.user, 'points_saved', 'study', id, { points: b.points.length, routes: b.routes.length });
    res.json(await studyDetail(req.user!, await visibleStudy(req.user!, id)));
  }));

  api.put('/studies/:id/assignments', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    await visibleStudy(req.user!, id);
    const b = assignmentsSchema.parse(req.body);
    await db.tx(async (tq) => {
      await tq('DELETE FROM study_assignments WHERE study_id = $1', [id]);
      for (const a of b.assignments) {
        const [u] = await tq('SELECT role, active FROM users WHERE id = $1', [a.user_id]);
        if (!u || !u.active || u.role !== 'OBSERVER') throw new HttpError(400, 'Assignments are for active observer accounts only', 'bad_assignment');
        const [p] = await tq('SELECT 1 FROM observation_points WHERE study_id = $1 AND code = $2', [id, a.point_code]);
        if (!p) throw new HttpError(400, `Point ${a.point_code} does not exist in this study`, 'bad_assignment');
        await tq(`INSERT INTO study_assignments (study_id, user_id, point_code, period_start, period_end) VALUES ($1,$2,$3,$4,$5)`,
          [id, a.user_id, a.point_code, a.period_start ?? null, a.period_end ?? null]);
      }
    });
    await audit(req.user, 'assignments_saved', 'study', id, { count: b.assignments.length });
    res.json(await studyDetail(req.user!, await visibleStudy(req.user!, id)));
  }));

  // ------------------------------------------------------------------ map sections (several schematic maps per study)
  const mapIdParam = (req: Request) => { const m = String(req.params.mapId); if (!UUID.test(m)) throw new HttpError(404, 'Not found', 'not_found'); return m; };

  api.post('/studies/:id/maps', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    await visibleStudy(req.user!, id);
    const b = mapCreateSchema.parse(req.body);
    if (b.image) { const err = validateImage(b.image); if (err) throw new HttpError(400, err, 'bad_image'); }
    const [{ n }] = await q('SELECT count(*)::int AS n FROM study_maps WHERE study_id = $1', [id]);
    if (n >= 8) throw new HttpError(409, 'A study can have at most 8 map sections', 'too_many_maps');
    await q('INSERT INTO study_maps (study_id, name, image, sort_order) VALUES ($1,$2,$3,$4)', [id, b.name, b.image ?? null, n]);
    await audit(req.user, 'map_added', 'study', id, { name: b.name });
    res.status(201).json(await studyDetail(req.user!, await visibleStudy(req.user!, id)));
  }));

  api.patch('/studies/:id/maps/:mapId', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req), mapId = mapIdParam(req);
    await visibleStudy(req.user!, id);
    const b = mapPatchSchema.parse(req.body);
    if (b.image) { const err = validateImage(b.image); if (err) throw new HttpError(400, err, 'bad_image'); }
    const sets: string[] = []; const vals: unknown[] = [mapId, id];
    for (const [k, v] of Object.entries(b)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    if (!sets.length) throw new HttpError(400, 'Nothing to update', 'empty');
    const rows = await q(`UPDATE study_maps SET ${sets.join(', ')} WHERE id = $1 AND study_id = $2 RETURNING id`, vals);
    if (!rows.length) throw new HttpError(404, 'Map not found', 'not_found');
    await audit(req.user, 'map_updated', 'study', id, { map: mapId, fields: Object.keys(b) });
    res.json(await studyDetail(req.user!, await visibleStudy(req.user!, id)));
  }));

  api.delete('/studies/:id/maps/:mapId', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req), mapId = mapIdParam(req);
    await visibleStudy(req.user!, id);
    const [{ n }] = await q('SELECT count(*)::int AS n FROM study_maps WHERE study_id = $1', [id]);
    if (n <= 1) throw new HttpError(409, 'A study keeps at least one map section', 'last_map');
    const first = await q('SELECT id FROM study_maps WHERE study_id = $1 AND id <> $2 ORDER BY sort_order, created_at LIMIT 1', [id, mapId]);
    await q('UPDATE observation_points SET map_id = $3 WHERE study_id = $1 AND map_id = $2', [id, mapId, first[0].id]); // its points move to the first remaining map
    await q('DELETE FROM study_maps WHERE id = $1 AND study_id = $2', [mapId, id]);
    await audit(req.user, 'map_deleted', 'study', id, { map: mapId });
    res.json(await studyDetail(req.user!, await visibleStudy(req.user!, id)));
  }));

  api.get('/studies/:id/maps/:mapId/image', wrap(async (req, res) => {
    const id = idParam(req), mapId = mapIdParam(req);
    await visibleStudy(req.user!, id);
    const [m] = await q('SELECT image FROM study_maps WHERE id = $1 AND study_id = $2', [mapId, id]);
    const mt = m?.image ? /^data:(image\/(?:png|jpeg|svg\+xml));base64,(.+)$/.exec(m.image) : null;
    if (!mt) throw new HttpError(404, 'No image', 'not_found');
    res.setHeader('Content-Type', mt[1]);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); // an SVG opened directly cannot run anything
    res.send(Buffer.from(mt[2], 'base64'));
  }));

  api.post('/studies/:id/seed-scenario', requireRole('ADMIN'), wrap(async (req, res) => {
    const id = idParam(req);
    const s = await visibleStudy(req.user!, id);
    if (!s.is_demo) throw new HttpError(409, 'Only the synthetic DEMO study can be reset', 'not_demo');
    await db.tx((tq) => resetDemoObservations(tq, id));
    await audit(req.user, 'demo_reset', 'study', id);
    res.json({ ok: true });
  }));

  // ------------------------------------------------------------------ observations
  async function record(user: AuthUser, input: ReturnType<typeof observationSchema.parse>, now = new Date()): Promise<Recorded> {
    const suffix = normalizePlateDigits(input.plate_suffix);
    if (suffix.length !== 3) return rejected('invalid_suffix', 'The plate suffix must be exactly 3 digits');
    const [study] = await q('SELECT id, status, audio_enabled FROM studies WHERE id = $1', [input.study_id]);
    const asg = await q(
      `SELECT a.point_code, p.point_type, a.period_start, a.period_end FROM study_assignments a
       JOIN observation_points p ON p.study_id = a.study_id AND p.code = a.point_code WHERE a.study_id = $1 AND a.user_id = $2`, [input.study_id, user.id]);
    if (!study || !asg.length) return rejected('not_assigned', 'You are not assigned to this study');
    const point = input.point_code ? asg.find((a) => a.point_code === input.point_code) : asg.length === 1 ? asg[0] : undefined;
    if (!point) return rejected(input.point_code ? 'wrong_point' : 'point_required', input.point_code ? `You are not assigned to point ${input.point_code}` : 'Choose which of your assigned points this observation belongs to');
    if (study.status !== 'ACTIVE') return rejected('study_not_active', `The study is ${study.status}; recording is only possible while it is ACTIVE`);
    const observed = input.observed_at ? new Date(input.observed_at) : now;
    if (observed.getTime() > now.getTime() + FUTURE_SKEW_MS) return rejected('future_timestamp', 'The observation time is in the future (check the device clock)');
    const slack = 5 * 60_000;
    if (point.period_start && observed.getTime() < new Date(point.period_start).getTime() - slack) return rejected('outside_period', 'The observation is before your assigned period');
    if (point.period_end && observed.getTime() > new Date(point.period_end).getTime() + slack) return rejected('outside_period', 'The observation is after your assigned period');
    let category = input.vehicle_category || 'UNKNOWN';
    if (!(await q('SELECT 1 FROM vehicle_categories WHERE code = $1', [category])).length) category = 'UNKNOWN'; // never lose a sighting over a label
    const clip = study.audio_enabled ? decodeClip(input) : null; // a bad or disabled clip never blocks the sighting itself
    const ins = await q(
      `INSERT INTO observations (study_id, point_code, point_type, plate_suffix, vehicle_category, vehicle_color, observed_at, observer_id, idempotency_key, audio, audio_mime, audio_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (observer_id, idempotency_key) DO NOTHING RETURNING id`,
      [input.study_id, point.point_code, point.point_type, suffix, category, input.vehicle_color ?? null, observed.toISOString(), user.id, input.idempotency_key, clip?.bytes ?? null, clip?.mime ?? null, clip?.ms ?? null]);
    const rows = await q(
      `SELECT ${OBS_COLS} ${OBS_FROM} WHERE ${ins.length ? 'o.id = $1' : 'o.observer_id = $1 AND o.idempotency_key = $2'}`,
      ins.length ? [ins[0].id] : [user.id, input.idempotency_key]);
    return { status: ins.length ? 'created' : 'duplicate', observation: rows[0] };
  }

  api.post('/observations', requireRole('OBSERVER'), wrap(async (req, res) => {
    const r = await record(req.user!, observationSchema.parse(req.body));
    if (r.status === 'rejected') return void res.status(422).json({ error: r.error, code: r.code });
    res.status(r.status === 'created' ? 201 : 200).json({ status: r.status, observation: r.observation });
  }));

  api.post('/observations/batch-sync', requireRole('OBSERVER'), wrap(async (req, res) => {
    const body = batchSchema.parse(req.body);
    const results = [];
    for (const item of body.observations) {
      const r = await record(req.user!, item);
      results.push({ idempotency_key: item.idempotency_key, ...(r.status === 'rejected' ? { status: 'rejected', code: r.code, error: r.error } : { status: r.status, id: r.observation.id }) });
    }
    res.json({
      results,
      created: results.filter((r) => r.status === 'created').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      rejected: results.filter((r) => r.status === 'rejected').length,
    });
  }));

  api.get('/studies/:id/observations', wrap(async (req, res) => {
    const u = req.user!;
    const id = idParam(req);
    await visibleStudy(u, id);
    const limit = Math.min(Math.max(Number(req.query.limit) || (u.role === 'OBSERVER' ? 50 : 1000), 1), 5000);
    const rows = await q(
      `SELECT ${OBS_COLS} ${OBS_FROM} WHERE o.study_id = $1 AND o.voided_at IS NULL ${u.role === 'OBSERVER' ? 'AND o.observer_id = $3' : ''}
       ORDER BY o.observed_at DESC, o.id LIMIT $2`, u.role === 'OBSERVER' ? [id, limit, u.id] : [id, limit]);
    res.json(rows);
  }));

  api.post('/observations/:id/void', wrap(async (req, res) => {
    const u = req.user!;
    const id = idParam(req);
    const { reason } = voidSchema.parse(req.body ?? {});
    const [o] = await q(`SELECT id, observer_id, voided_at, (extract(epoch from (now() - received_at)) * 1000)::float8 AS age_ms FROM observations WHERE id = $1`, [id]);
    if (!o || (u.role === 'OBSERVER' && o.observer_id !== u.id)) throw new HttpError(404, 'Observation not found', 'not_found');
    if (o.voided_at) return void res.json({ ok: true, already: true });
    if (u.role === 'OBSERVER' && o.age_ms > VOID_WINDOW_MS) throw new HttpError(403, 'Observers can undo an entry only within 10 minutes; ask a supervisor', 'void_window');
    await q('UPDATE observations SET voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1', [id, u.id, reason ?? null]);
    await audit(u, 'observation_voided', 'observation', id, { reason });
    res.json({ ok: true });
  }));

  api.get('/observations/:id/audio', wrap(async (req, res) => {
    const u = req.user!;
    const id = idParam(req);
    const [o] = await q('SELECT observer_id, audio, audio_mime FROM observations WHERE id = $1', [id]);
    if (!o || !o.audio || (u.role === 'OBSERVER' && o.observer_id !== u.id)) throw new HttpError(404, 'No audio', 'not_found');
    res.setHeader('Content-Type', o.audio_mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(o.audio));
  }));

  /** Supervisor fixes a wrong suffix (e.g. after listening to the clip): the old event is voided, a new one keeps time, point, observer and clip. */
  api.post('/observations/:id/correct', requireRole('ADMIN', 'SUPERVISOR'), wrap(async (req, res) => {
    const id = idParam(req);
    const b = correctSchema.parse(req.body);
    const suffix = normalizePlateDigits(b.plate_suffix);
    if (suffix.length !== 3) throw new HttpError(400, 'The plate suffix must be exactly 3 digits', 'invalid_suffix');
    const created = await db.tx(async (tq) => {
      const [o] = await tq('SELECT * FROM observations WHERE id = $1 AND voided_at IS NULL', [id]);
      if (!o) throw new HttpError(404, 'Observation not found', 'not_found');
      if (String(o.plate_suffix).trim() === suffix) throw new HttpError(400, 'The suffix is already ' + suffix, 'no_change');
      await tq('UPDATE observations SET voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1', [id, req.user!.id, `corrected to ${suffix}${b.reason ? ': ' + b.reason : ''}`]);
      const [n] = await tq(
        `INSERT INTO observations (study_id, point_code, point_type, plate_suffix, vehicle_category, vehicle_color, observed_at, observer_id, idempotency_key, audio, audio_mime, audio_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [o.study_id, o.point_code, o.point_type, suffix, o.vehicle_category, o.vehicle_color, o.observed_at, o.observer_id, `corr-${crypto.randomUUID()}`, o.audio, o.audio_mime, o.audio_ms]);
      return n.id as string;
    });
    await audit(req.user, 'observation_corrected', 'observation', id, { new_id: created, suffix });
    res.json({ ok: true, id: created });
  }));

  // ------------------------------------------------------------------ matching, reviews, exports
  /** Everything the Python engine needs for one study: live (non-voided) observations, stored reviews, route distances. */
  async function enginePayload(studyId: string, params: MatchParams) {
    const observations = await q(
      `SELECT o.id, o.study_id, o.point_code, o.point_type, o.plate_suffix::text AS plate_suffix, o.vehicle_category, o.vehicle_color,
              ${ts('o.observed_at')} AS observation_timestamp, o.observer_id
       FROM observations o WHERE o.study_id = $1 AND o.voided_at IS NULL ORDER BY o.observed_at, o.id`, [studyId]);
    const reviews = await q(`SELECT entry_observation_id AS entry_id, exit_observation_id AS exit_id, decision, note FROM match_reviews WHERE study_id = $1`, [studyId]);
    const routes = await q(`SELECT origin_code, destination_code, distance_meters::float8 AS d FROM route_distances WHERE study_id = $1`, [studyId]);
    return { observations, reviews, route_distances: Object.fromEntries(routes.map((r) => [`${r.origin_code}->${r.destination_code}`, r.d])), ...params };
  }
  const engineOpts = engineOptions(cfg);
  async function buildReport(studyId: string, params: MatchParams) {
    const payload = await enginePayload(studyId, params);
    return { report: await runEngine('report', payload, engineOpts), observations: payload.observations };
  }

  api.post('/studies/:id/match', requireRole('ADMIN', 'SUPERVISOR'), wrap(async (req, res) => {
    const id = idParam(req);
    await visibleStudy(req.user!, id);
    const { report } = await buildReport(id, matchSchema.parse(req.body ?? {}));
    res.json(report);
  }));

  api.post('/studies/:id/reviews', requireRole('ADMIN', 'SUPERVISOR'), wrap(async (req, res) => {
    const id = idParam(req);
    await visibleStudy(req.user!, id);
    const b = reviewWithClear.parse(req.body);
    const pair = await q(
      `SELECT o.id, o.point_type, o.plate_suffix::text AS suffix, o.observed_at FROM observations o WHERE o.study_id = $1 AND o.voided_at IS NULL AND o.id IN ($2,$3)`,
      [id, b.entry_observation_id, b.exit_observation_id]);
    const e = pair.find((r) => r.id === b.entry_observation_id), x = pair.find((r) => r.id === b.exit_observation_id);
    if (!e || !x || e.point_type !== 'ENTRY' || x.point_type !== 'EXIT') throw new HttpError(400, 'A review needs one ENTRY and one EXIT observation of this study', 'bad_review');
    if (e.suffix !== x.suffix) throw new HttpError(400, 'The two observations have different plate suffixes', 'bad_review');
    if (new Date(x.observed_at) <= new Date(e.observed_at)) throw new HttpError(400, 'The exit must be after the entry', 'bad_review');
    if (b.decision === 'CLEAR') {
      await q('DELETE FROM match_reviews WHERE entry_observation_id = $1 AND exit_observation_id = $2', [b.entry_observation_id, b.exit_observation_id]);
    } else {
      await q(
        `INSERT INTO match_reviews (study_id, entry_observation_id, exit_observation_id, decision, note, reviewer_id) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (entry_observation_id, exit_observation_id) DO UPDATE SET decision = EXCLUDED.decision, note = EXCLUDED.note, reviewer_id = EXCLUDED.reviewer_id, created_at = now()`,
        [id, b.entry_observation_id, b.exit_observation_id, b.decision, b.note ?? null, req.user!.id]);
    }
    await audit(req.user, `review_${b.decision.toLowerCase()}`, 'study', id, { entry: b.entry_observation_id, exit: b.exit_observation_id });
    res.json({ ok: true });
  }));

  const exportParams = (req: Request): MatchParams => {
    const n = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
    return matchSchema.parse({
      min_travel_time_sec: n(req.query.min), max_travel_time_sec: n(req.query.max), interval_minutes: n(req.query.interval),
      strict_category_match: req.query.strict === '1' || req.query.strict === 'true',
    });
  };
  const fileSlug = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'study';

  api.get('/studies/:id/export.csv', requireRole('ADMIN', 'SUPERVISOR'), wrap(async (req, res) => {
    const id = idParam(req);
    const s = await visibleStudy(req.user!, id);
    const out = await runEngine<{ csv: string }>('export_csv', await enginePayload(id, exportParams(req)), engineOpts);
    await audit(req.user, 'export_csv', 'study', id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="TrafficLab_${fileSlug(s.name)}.csv"`);
    res.send(BOM + out.csv); // BOM so Excel reads UTF-8 (Persian) correctly
  }));

  api.get('/studies/:id/export.xlsx', requireRole('ADMIN', 'SUPERVISOR'), wrap(async (req, res) => {
    const id = idParam(req);
    const s = await visibleStudy(req.user!, id);
    const { report, observations } = await buildReport(id, exportParams(req));
    const names = new Map((await q('SELECT id, full_name FROM users')).map((u) => [u.id, u.full_name]));
    const buf = await buildWorkbook({
      study: { name: s.name, study_date: s.study_date_text, timezone: s.timezone, is_demo: s.is_demo },
      report,
      observations: observations.map((o) => ({ ...o, observed_at: o.observation_timestamp, observer_name: names.get(o.observer_id) ?? '' })),
    });
    await audit(req.user, 'export_xlsx', 'study', id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="TrafficLab_${fileSlug(s.name)}.xlsx"`);
    res.send(buf);
  }));

  api.get('/audit', requireRole('ADMIN'), wrap(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    res.json(await q(`SELECT id, ${ts('at')} AS at, username, action, entity, entity_id, detail FROM audit_logs ORDER BY id DESC LIMIT $1`, [limit]));
  }));

  api.use((_req, res) => void res.status(404).json({ error: 'Unknown API route', code: 'not_found' }));

  // ------------------------------------------------------------------ errors
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, code: err.code });
    if (err instanceof ZodError) return void res.status(400).json({ error: 'Validation failed', code: 'validation', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    if (err instanceof EngineError) {
      console.error('[engine]', err.kind, err.message);
      return void res.status(err.kind === 'invalid' ? 400 : err.kind === 'timeout' ? 504 : 502).json({ error: err.kind === 'invalid' ? err.message : 'The analysis engine is not available right now', code: `engine_${err.kind}` });
    }
    if (err?.type === 'entity.too.large') return void res.status(413).json({ error: 'Request body too large', code: 'too_large' });
    if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: 'Malformed JSON', code: 'bad_json' });
    if (err?.code === '23505') return void res.status(409).json({ error: 'Already exists', code: 'duplicate' });
    if (err?.code === '23503') return void res.status(409).json({ error: 'Referenced record missing or in use', code: 'conflict' });
    if (err?.code === '23514' || err?.code === '22P02' || err?.code === '22007') return void res.status(400).json({ error: 'Invalid value', code: 'validation' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error', code: 'internal' });
  });

  return app;
}

/** Deletes observations (and their reviews) of studies whose retention period has passed. Returns rows removed. */
export async function applyRetention(db: Db): Promise<number> {
  const due = await db.query(`SELECT id, name, retention_days FROM studies WHERE retention_days IS NOT NULL AND study_date + retention_days < current_date`);
  let removed = 0;
  for (const s of due) {
    const rows = await db.query('DELETE FROM observations WHERE study_id = $1 RETURNING id', [s.id]);
    if (rows.length) {
      removed += rows.length;
      await db.query(`INSERT INTO audit_logs (action, entity, entity_id, detail) VALUES ('retention_purge','study',$1,$2)`, [s.id, JSON.stringify({ removed: rows.length, retention_days: s.retention_days })]);
    }
  }
  return removed;
}
