import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { migrate, openDb, type Db } from '../db.ts';
import { bootstrap } from '../seed.ts';

const PW = 'Demo-pass-1';
const ADMIN_PW = 'Admin-pass-1';
let base = '';
let db: Db;
let server: Server;

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'x-tl-csrf': '1' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const raw = Buffer.from(await res.arrayBuffer());
    // decode text ourselves: fetch's res.text() would silently strip the UTF-8 BOM we want to assert on
    const data = ct.includes('json') ? JSON.parse(raw.toString('utf8')) : ct.includes('text') ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(raw) : raw;
    return { status: res.status, data: data as any, headers: res.headers };
  }
  async login(username: string, password: string) {
    const r = await this.call('POST', '/api/v1/auth/login', { username, password });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return this;
  }
}
const as = (u: string, p = PW) => new Client().login(u, p);

beforeAll(async () => {
  const cfg = loadConfig({ env: 'test', sessionSecret: 's'.repeat(40), seedDemo: true, seedPassword: PW, adminPassword: ADMIN_PW, trustProxy: false });
  db = await openDb({ databaseUrl: null, dataDir: null });
  await migrate(db);
  await bootstrap(db, cfg);
  server = createApp(cfg, db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60_000);

afterAll(async () => {
  server?.close();
  await db?.close();
});

describe('authentication and roles', () => {
  it('rejects anonymous requests', async () => {
    const c = new Client();
    expect((await c.call('GET', '/api/v1/studies')).status).toBe(401);
    expect((await c.call('GET', '/api/v1/auth/me')).status).toBe(401);
    expect((await c.call('POST', '/api/v1/auth/switch-user', { userId: 'u-admin' })).status).toBe(401);
  });

  it('login sets an HttpOnly session cookie; wrong password is refused', async () => {
    const c = new Client();
    expect((await c.call('POST', '/api/v1/auth/login', { username: 'admin', password: 'nope-nope' })).status).toBe(401);
    const ok = await c.call('POST', '/api/v1/auth/login', { username: 'ADMIN', password: ADMIN_PW });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(ok.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(ok.data)).not.toMatch(/password|hash/i);
  });

  it('state-changing requests need the CSRF header', async () => {
    const admin = await as('admin', ADMIN_PW);
    const r = await fetch(base + '/api/v1/studies', { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin.cookie }, body: '{}' });
    expect(r.status).toBe(403);
  });

  it('a forged or tampered cookie is not a session', async () => {
    const admin = await as('admin', ADMIN_PW);
    const bad = new Client();
    bad.cookie = admin.cookie.slice(0, -3) + 'abc';
    expect((await bad.call('GET', '/api/v1/auth/me')).status).toBe(401);
  });

  it('locks the account after 5 failed logins', async () => {
    const c = new Client();
    for (let i = 0; i < 5; i++) expect((await c.call('POST', '/api/v1/auth/login', { username: 'observer04', password: 'wrong-wrong' })).status).toBe(401);
    const r = await c.call('POST', '/api/v1/auth/login', { username: 'observer04', password: PW });
    expect(r.status).toBe(429);
    await db.query(`UPDATE users SET locked_until = NULL, failed_logins = 0 WHERE username = 'observer04'`);
  });

  it('role matrix: replaying admin endpoints with lower roles is refused', async () => {
    const obs = await as('observer01');
    const sup = await as('supervisor');
    const admin = await as('admin', ADMIN_PW);
    const study = (await admin.call('GET', '/api/v1/studies')).data[0];
    const calls: [string, string, unknown][] = [
      ['POST', '/api/v1/studies', { name: 'x', study_date: '2026-10-31' }],
      ['GET', '/api/v1/audit', undefined],
      ['POST', '/api/v1/users', { username: 'hacker', full_name: 'h', role: 'ADMIN', password: 'password1' }],
      ['PUT', `/api/v1/studies/${study.id}/points`, { points: [], routes: [] }],
      ['POST', `/api/v1/studies/${study.id}/seed-scenario`, undefined],
    ];
    for (const [m, p, b] of calls) {
      expect((await obs.call(m, p, b)).status, `observer ${m} ${p}`).toBe(403);
      if (!p.endsWith('/audit') || true) expect((await sup.call(m, p, b)).status, `supervisor ${m} ${p}`).toBe(403);
    }
    expect((await obs.call('POST', `/api/v1/studies/${study.id}/match`, {})).status).toBe(403);
    expect((await obs.call('GET', `/api/v1/studies/${study.id}/export.csv`)).status).toBe(403);
    expect((await sup.call('POST', `/api/v1/studies/${study.id}/match`, {})).status).toBe(200);
  });

  it('administrators cannot lock themselves out', async () => {
    const admin = await as('admin', ADMIN_PW);
    const me = (await admin.call('GET', '/api/v1/auth/me')).data.user;
    expect((await admin.call('PATCH', `/api/v1/users/${me.id}`, { active: false })).status).toBe(409);
    expect((await admin.call('PATCH', `/api/v1/users/${me.id}`, { role: 'SUPERVISOR' })).status).toBe(409);
  });
});

describe('observer scope and recording rules', () => {
  it('an observer sees only the studies they are assigned to', async () => {
    const admin = await as('admin', ADMIN_PW);
    const other = (await admin.call('POST', '/api/v1/studies', { name: 'Private study', study_date: '2026-11-01', status: 'ACTIVE' })).data;
    const obs = await as('observer01');
    const list = (await obs.call('GET', '/api/v1/studies')).data;
    expect(list.map((s: any) => s.id)).not.toContain(other.id);
    expect((await obs.call('GET', `/api/v1/studies/${other.id}`)).status).toBe(404);
    expect((await obs.call('GET', `/api/v1/studies/${other.id}/observations`)).status).toBe(404);
  });

  it('point and observer come from the server, never from the request', async () => {
    const obs = await as('observer01');
    const me = (await obs.call('GET', '/api/v1/auth/me')).data;
    const a = me.assignments[0];
    expect(a.point_code).toBe('E01');
    const forged = await obs.call('POST', '/api/v1/observations', { study_id: a.study_id, point_code: 'X02', plate_suffix: '123', idempotency_key: 'forged-point-1' });
    expect(forged.status).toBe(422);
    expect(forged.data.code).toBe('wrong_point');
    const ok = await obs.call('POST', '/api/v1/observations', { study_id: a.study_id, plate_suffix: '123', idempotency_key: 'own-point-0001', observer_id: 'someone-else', point_type: 'EXIT' });
    expect(ok.status).toBe(201);
    expect(ok.data.observation.point_code).toBe('E01');
    expect(ok.data.observation.point_type).toBe('ENTRY');
    expect(ok.data.observation.observer_id).toBe(me.user.id);
  });

  it('requires exactly three digits, keeps leading zeros, accepts Persian digits', async () => {
    const obs = await as('observer01');
    const sid = (await obs.call('GET', '/api/v1/auth/me')).data.assignments[0].study_id;
    expect((await obs.call('POST', '/api/v1/observations', { study_id: sid, plate_suffix: '7', idempotency_key: 'short-suffix-1' })).data.code).toBe('invalid_suffix');
    expect((await obs.call('POST', '/api/v1/observations', { study_id: sid, plate_suffix: '1234', idempotency_key: 'long-suffix-01' })).data.code).toBe('invalid_suffix');
    const p = await obs.call('POST', '/api/v1/observations', { study_id: sid, plate_suffix: '۰۴۲', idempotency_key: 'persian-digits1' });
    expect(p.status).toBe(201);
    expect(p.data.observation.plate_suffix).toBe('042');
  });

  it('duplicate submissions are idempotent; repeated suffixes with new keys are kept', async () => {
    const obs = await as('observer01');
    const sid = (await obs.call('GET', '/api/v1/auth/me')).data.assignments[0].study_id;
    const body = { study_id: sid, plate_suffix: '555', idempotency_key: 'idem-key-0001' };
    const first = await obs.call('POST', '/api/v1/observations', body);
    const second = await obs.call('POST', '/api/v1/observations', body);
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.data.status).toBe('duplicate');
    expect(second.data.observation.id).toBe(first.data.observation.id);
    const again = await obs.call('POST', '/api/v1/observations', { ...body, idempotency_key: 'idem-key-0002' });
    expect(again.status).toBe(201); // a different vehicle with the same suffix is a separate event
  });

  it('rejects timestamps from the future', async () => {
    const obs = await as('observer01');
    const sid = (await obs.call('GET', '/api/v1/auth/me')).data.assignments[0].study_id;
    const r = await obs.call('POST', '/api/v1/observations', { study_id: sid, plate_suffix: '321', observed_at: new Date(Date.now() + 3600_000).toISOString(), idempotency_key: 'future-time-01' });
    expect(r.data.code).toBe('future_timestamp');
  });

  it('batch sync reports every item and never drops one silently', async () => {
    const obs = await as('observer03');
    const sid = (await obs.call('GET', '/api/v1/auth/me')).data.assignments[0].study_id;
    const t = '2026-10-30T09:00:00+03:30';
    const r = await obs.call('POST', '/api/v1/observations/batch-sync', {
      observations: [
        { study_id: sid, plate_suffix: '901', observed_at: t, idempotency_key: 'batch-item-001' },
        { study_id: sid, plate_suffix: '901', observed_at: t, idempotency_key: 'batch-item-001' },
        { study_id: sid, plate_suffix: '12', observed_at: t, idempotency_key: 'batch-item-002' },
        { study_id: sid, plate_suffix: '902', point_code: 'X01', observed_at: t, idempotency_key: 'batch-item-003' },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.data.results.map((x: any) => x.status)).toEqual(['created', 'duplicate', 'rejected', 'rejected']);
    expect(r.data.results.length).toBe(4);
    expect(r.data.created + r.data.duplicates + r.data.rejected).toBe(4);
    const saved = await obs.call('GET', `/api/v1/studies/${sid}/observations`);
    expect(saved.data.find((o: any) => o.plate_suffix === '901').observation_timestamp).toBe('2026-10-30T05:30:00.000Z'); // original time kept
  });

  it('observers undo their own entry within the window; others cannot touch it', async () => {
    const o1 = await as('observer01');
    const o2 = await as('observer02');
    const sid = (await o1.call('GET', '/api/v1/auth/me')).data.assignments[0].study_id;
    const rec = (await o1.call('POST', '/api/v1/observations', { study_id: sid, plate_suffix: '808', idempotency_key: 'void-me-00001' })).data.observation;
    expect((await o2.call('POST', `/api/v1/observations/${rec.id}/void`, {})).status).toBe(404);
    expect((await o1.call('POST', `/api/v1/observations/${rec.id}/void`, { reason: 'typo' })).status).toBe(200);
    const list = (await o1.call('GET', `/api/v1/studies/${sid}/observations`)).data;
    expect(list.find((o: any) => o.id === rec.id)).toBeUndefined();
    const row = (await db.query('SELECT voided_at, void_reason FROM observations WHERE id = $1', [rec.id]))[0];
    expect(row.voided_at).not.toBeNull(); // soft delete: the event is preserved
    expect(row.void_reason).toBe('typo');
  });

  it('an observer cannot undo after the window; a supervisor can', async () => {
    const o1 = await as('observer01');
    const sup = await as('supervisor');
    const sid = (await o1.call('GET', '/api/v1/auth/me')).data.assignments[0].study_id;
    const rec = (await o1.call('POST', '/api/v1/observations', { study_id: sid, plate_suffix: '809', idempotency_key: 'old-entry-0001' })).data.observation;
    await db.query(`UPDATE observations SET received_at = now() - interval '30 minutes' WHERE id = $1`, [rec.id]);
    expect((await o1.call('POST', `/api/v1/observations/${rec.id}/void`, {})).status).toBe(403);
    expect((await sup.call('POST', `/api/v1/observations/${rec.id}/void`, { reason: 'wrong' })).status).toBe(200);
  });
});

describe('full MVP acceptance scenario (spec section 19)', () => {
  let admin: Client, o1: Client, o2: Client, sup: Client, studyId: string;

  beforeAll(async () => {
    admin = await as('admin', ADMIN_PW);
    sup = await as('supervisor');
    const s = (await admin.call('POST', '/api/v1/studies', { name: 'Acceptance', study_date: '2026-10-30', status: 'ACTIVE', timezone: 'Asia/Tehran' })).data;
    studyId = s.id;
    const pts = [['E01', 'ENTRY', 25, 20], ['E02', 'ENTRY', 20, 70], ['X01', 'EXIT', 80, 25], ['X02', 'EXIT', 75, 80]] as const;
    const saved = await admin.call('PUT', `/api/v1/studies/${studyId}/points`, {
      points: pts.map(([code, point_type, x, y]) => ({ code, point_type, description: code, x_percent: x, y_percent: y })),
      routes: [{ origin_code: 'E01', destination_code: 'X01', distance_meters: 2500 }],
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const mk = async (username: string) => (await admin.call('POST', '/api/v1/users', { username, full_name: username, role: 'OBSERVER', password: 'Observer-pass-1' })).data.id as string;
    const [u1, u2] = [await mk('acc.obs1'), await mk('acc.obs2')];
    const asg = await admin.call('PUT', `/api/v1/studies/${studyId}/assignments`, { assignments: [{ user_id: u1, point_code: 'E01' }, { user_id: u2, point_code: 'X01' }] });
    expect(asg.status, JSON.stringify(asg.data)).toBe(200);
    o1 = await as('acc.obs1', 'Observer-pass-1');
    o2 = await as('acc.obs2', 'Observer-pass-1');
  });

  const rec = (c: Client, suffix: string, local: string, key: string, category = 'CAR') =>
    c.call('POST', '/api/v1/observations', { study_id: studyId, plate_suffix: suffix, vehicle_category: category, observed_at: `2026-10-30T${local}+03:30`, idempotency_key: key });

  it('records 387 at E01 and X01, matches, computes travel time, speed, OD and dashboard counts', async () => {
    expect((await rec(o1, '387', '08:15:10', 'acc-387-entry')).status).toBe(201);
    expect((await rec(o2, '387', '08:19:20', 'acc-387-exit-')).status).toBe(201);
    const r = (await sup.call('POST', `/api/v1/studies/${studyId}/match`, {})).data;
    expect(r.summary.matched_journeys).toBe(1);
    const m = r.matches[0];
    expect([m.entry_point_code, m.exit_point_code, m.travel_time_seconds, m.estimated_speed_kmh]).toEqual(['E01', 'X01', 250, 36]);
    expect(r.analytics.od_matrix.counts.E01.X01).toBe(1);
    expect(r.analytics.counts.entries).toBe(1);
    expect(r.analytics.counts.exits).toBe(1);
    expect(r.analytics.route_speeds[0].mean_journey_speed_kmh).toBe(36);
  });

  it('two different vehicles with the same suffix are not blindly associated', async () => {
    await rec(o1, '777', '08:16:20', 'acc-777-entry1');
    await rec(o1, '777', '08:17:00', 'acc-777-entry2');
    await rec(o2, '777', '08:22:15', 'acc-777-exit--');
    const r = (await sup.call('POST', `/api/v1/studies/${studyId}/match`, {})).data;
    expect(r.ambiguous.length).toBe(1);
    expect(r.ambiguous[0].candidate_pairs.length).toBe(2);
    expect(r.matches.some((m: any) => m.plate_suffix === '777')).toBe(false);
    expect(r.summary.unmatched_entries).toBe(0);
  });

  it('supervisor review is stored: confirm one candidate, reject the other, survive a re-run, can be cleared', async () => {
    const r1 = (await sup.call('POST', `/api/v1/studies/${studyId}/match`, {})).data;
    const [c1, c2] = r1.ambiguous[0].candidate_pairs;
    expect((await o1.call('POST', `/api/v1/studies/${studyId}/reviews`, { entry_observation_id: c1.entry_id, exit_observation_id: c1.exit_id, decision: 'REVIEWED' })).status).toBe(403);
    expect((await sup.call('POST', `/api/v1/studies/${studyId}/reviews`, { entry_observation_id: c1.entry_id, exit_observation_id: c1.exit_id, decision: 'REVIEWED', note: 'seen both' })).status).toBe(200);
    const r2 = (await sup.call('POST', `/api/v1/studies/${studyId}/match`, {})).data;
    const reviewed = r2.matches.find((m: any) => m.match_status === 'REVIEWED');
    expect(reviewed.entry_observation_id).toBe(c1.entry_id);
    expect(r2.ambiguous.length).toBe(0);
    expect(r2.summary.unmatched_entries).toBe(1);
    expect((await sup.call('POST', `/api/v1/studies/${studyId}/reviews`, { entry_observation_id: c2.entry_id, exit_observation_id: c2.exit_id, decision: 'REJECTED' })).status).toBe(200);
    expect((await sup.call('POST', `/api/v1/studies/${studyId}/reviews`, { entry_observation_id: c1.entry_id, exit_observation_id: c1.exit_id, decision: 'CLEAR' })).status).toBe(200);
    const r3 = (await sup.call('POST', `/api/v1/studies/${studyId}/match`, {})).data;
    expect(r3.matches.filter((m: any) => m.plate_suffix === '777').length).toBe(1); // only the unrejected candidate is left, unambiguous now
  });

  it('exports CSV (BOM, leading zeros, neutralised formulas) and a real XLSX workbook', async () => {
    await rec(o1, '042', '08:30:00', 'acc-042-entry-', '=SUM(A1)');
    await rec(o2, '042', '08:34:00', 'acc-042-exit--');
    const csv = await sup.call('GET', `/api/v1/studies/${studyId}/export.csv`);
    expect(csv.status).toBe(200);
    expect(csv.data.charCodeAt(0)).toBe(0xfeff);
    expect(csv.data).toContain('042');
    expect(csv.data).not.toMatch(/[,\n]=SUM/);
    const xlsx = await sup.call('GET', `/api/v1/studies/${studyId}/export.xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get('content-type')).toContain('spreadsheetml');
    expect((xlsx.data as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('a point in use cannot be removed or change type; completed studies refuse recording', async () => {
    const del = await admin.call('PUT', `/api/v1/studies/${studyId}/points`, {
      points: [{ code: 'E02', point_type: 'ENTRY', description: '', x_percent: 20, y_percent: 70 }, { code: 'X01', point_type: 'EXIT', description: '', x_percent: 80, y_percent: 25 }], routes: [] });
    expect(del.status).toBe(409);
    expect(del.data.code).toBe('point_in_use');
    expect((await admin.call('PATCH', `/api/v1/studies/${studyId}`, { status: 'COMPLETED' })).status).toBe(200);
    expect((await rec(o1, '111', '09:00:00', 'acc-after-close')).data.code).toBe('study_not_active');
    await admin.call('PATCH', `/api/v1/studies/${studyId}`, { status: 'ACTIVE' });
  });

  it('validation errors are specific and do not leak internals', async () => {
    const r = await admin.call('PUT', `/api/v1/studies/${studyId}/points`, { points: [{ code: 'a b', point_type: 'SIDE', x_percent: 500, y_percent: 1 }], routes: [] });
    expect(r.status).toBe(400);
    expect(r.data.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.data)).not.toMatch(/stack|node_modules|SELECT/i);
    expect((await admin.call('PATCH', `/api/v1/studies/${studyId}`, { schematic_image: 'data:image/svg+xml;base64,' + Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64') })).status).toBe(400);
    expect((await admin.call('GET', '/api/v1/studies/not-a-uuid')).status).toBe(404);
  });

  it('a valid SVG schematic can be stored and is returned with the study', async () => {
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>').toString('base64');
    const r = await admin.call('PATCH', `/api/v1/studies/${studyId}`, { schematic_image: svg });
    expect(r.status).toBe(200);
    expect(r.data.schematic_type).toBe('CUSTOM_IMAGE');
    expect(r.data.schematic_image_url).toBe(svg);
    const list = (await admin.call('GET', '/api/v1/studies')).data;
    expect(JSON.stringify(list)).not.toContain('base64'); // list never carries the image
  });
});

describe('demo data and audit', () => {
  it('the seeded scenario is flagged DEMO and reproduces the 387 journey in Tehran local time', async () => {
    const sup = await as('supervisor');
    const demo = (await sup.call('GET', '/api/v1/studies')).data.find((s: any) => s.is_demo);
    expect(demo.name).toMatch(/^DEMO/);
    const r = (await sup.call('POST', `/api/v1/studies/${demo.id}/match`, {})).data;
    const m = r.matches.find((x: any) => x.plate_suffix === '387');
    expect(m.travel_time_seconds).toBe(250);
    expect(m.entry_timestamp).toBe('2026-10-30T04:45:10Z'); // 08:15:10 at +03:30
    expect(r.ambiguous.some((a: any) => a.plate_suffix === '777')).toBe(true);
  });

  it('demo reset only works for the demo study', async () => {
    const admin = await as('admin', ADMIN_PW);
    const list = (await admin.call('GET', '/api/v1/studies')).data;
    const real = list.find((s: any) => !s.is_demo);
    expect((await admin.call('POST', `/api/v1/studies/${real.id}/seed-scenario`, {})).status).toBe(409);
    const demo = list.find((s: any) => s.is_demo);
    expect((await admin.call('POST', `/api/v1/studies/${demo.id}/seed-scenario`, {})).status).toBe(200);
  });

  it('administrator actions are written to the audit log', async () => {
    const admin = await as('admin', ADMIN_PW);
    const log = (await admin.call('GET', '/api/v1/audit?limit=200')).data;
    const actions = new Set(log.map((l: any) => l.action));
    for (const a of ['login', 'login_failed', 'study_created', 'points_saved', 'user_created', 'observation_voided', 'review_reviewed', 'export_xlsx']) expect(actions.has(a), a).toBe(true);
  });

  it('health endpoint reports database and engine', async () => {
    const r = await new Client().call('GET', '/healthz');
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ ok: true, database: 'pglite', engine: 'ok' });
  });
});
