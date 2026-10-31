import type { Config } from './config.ts';
import { hashPassword } from './auth.ts';
import type { Db, Query } from './db.ts';

export const DEFAULT_CATEGORIES: [string, string, string, number][] = [
  ['CAR', 'Passenger car', 'سواری', 10],
  ['MOTORCYCLE', 'Motorcycle', 'موتورسیکلت', 20],
  ['TAXI', 'Taxi', 'تاکسی', 30],
  ['PICKUP', 'Pickup', 'وانت', 40],
  ['VAN', 'Van', 'ون', 50],
  ['MINIBUS', 'Minibus', 'مینی‌بوس', 60],
  ['BUS', 'Bus', 'اتوبوس', 70],
  ['LIGHT_TRUCK', 'Light truck', 'کامیونت', 80],
  ['HEAVY_TRUCK', 'Heavy truck', 'کامیون', 90],
  ['OTHER', 'Other', 'سایر', 100],
  ['UNKNOWN', 'Unknown', 'نامشخص', 110],
];

/** Synthetic scenario (spec 19): times are Tehran local (+03:30), the study's configured zone. */
const DEMO_PAIRS: [string, string, string, string, string, string][] = [
  // suffix, category, entry point, exit point, entry local time, exit local time
  ['387', 'CAR', 'E01', 'X01', '08:15:10', '08:19:20'],
  ['542', 'TAXI', 'E02', 'X02', '08:15:18', '08:20:10'],
  ['921', 'BUS', 'E01', 'X01', '08:15:35', '08:21:05'],
  ['042', 'PICKUP', 'E02', 'X01', '08:16:00', '08:21:40'],
  ['118', 'MOTORCYCLE', 'E01', 'X02', '08:17:10', '08:22:10'],
  ['633', 'HEAVY_TRUCK', 'E02', 'X01', '08:18:00', '08:24:30'],
  ['409', 'CAR', 'E01', 'X01', '08:19:00', '08:23:45'],
  ['855', 'VAN', 'E02', 'X02', '08:20:15', '08:25:20'],
];
const DEMO_AMBIGUOUS: [string, string, string, string][] = [
  // two different vehicles with suffix 777 enter, one exit is recorded
  ['777', 'E01', 'ENTRY', '08:16:20'],
  ['777', 'E02', 'ENTRY', '08:17:00'],
  ['777', 'X01', 'EXIT', '08:22:15'],
];
const at = (hms: string) => `2026-10-30T${hms}+03:30`;

export async function ensureCategories(q: Query) {
  for (const [code, en, fa, order] of DEFAULT_CATEGORIES) {
    await q(`INSERT INTO vehicle_categories (code, label_en, label_fa, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING`, [code, en, fa, order]);
  }
}

/** Replaces the observations of a demo study with the synthetic scenario. Only ever called for is_demo studies. */
export async function resetDemoObservations(q: Query, studyId: string) {
  await q('DELETE FROM match_reviews WHERE study_id = $1', [studyId]);
  await q('DELETE FROM observations WHERE study_id = $1', [studyId]);
  const assigned = await q('SELECT point_code, user_id FROM study_assignments WHERE study_id = $1', [studyId]);
  const who = new Map(assigned.map((r) => [r.point_code as string, r.user_id as string]));
  const ins = async (suffix: string, cat: string, point: string, type: string, hms: string, key: string) => {
    const uid = who.get(point);
    if (!uid) return;
    await q(
      `INSERT INTO observations (study_id, point_code, point_type, plate_suffix, vehicle_category, observed_at, observer_id, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [studyId, point, type, suffix, cat, at(hms), uid, key],
    );
  };
  for (const [s, cat, e, x, te, tx] of DEMO_PAIRS) {
    await ins(s, cat, e, 'ENTRY', te, `demo-e-${s}`);
    await ins(s, cat, x, 'EXIT', tx, `demo-x-${s}`);
  }
  for (const [s, p, type, t] of DEMO_AMBIGUOUS) await ins(s, 'CAR', p, type, t, `demo-amb-${p}-${s}`);
}

async function createUser(q: Query, username: string, full: string, role: string, pw: string) {
  const rows = await q(`INSERT INTO users (username, full_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id`, [username, full, role, await hashPassword(pw)]);
  return rows[0].id as string;
}

export async function createDemoStudy(q: Query, adminId: string, observers: Record<string, string>) {
  const [study] = await q(
    `INSERT INTO studies (name, description, study_date, start_time, end_time, timezone, supervisor_name, status, is_demo, created_by)
     VALUES ($1,$2,'2026-10-30','08:00','12:00','Asia/Tehran','Eng. Kaveh Mirzai','ACTIVE',true,$3) RETURNING id`,
    ['DEMO - Azadi Intersection Network Survey', 'Synthetic demonstration data (not real observations): entry-exit cordon study with 2 entries and 2 exits.', adminId],
  );
  const sid = study.id as string;
  const pts: [string, string, string, number, number][] = [
    ['E01', 'ENTRY', 'Northern Arterial Inbound', 25, 18], ['E02', 'ENTRY', 'Western Corridor Inbound', 18, 75],
    ['X01', 'EXIT', 'Eastern Expressway Outbound', 82, 25], ['X02', 'EXIT', 'Southern Avenue Outbound', 72, 82],
  ];
  for (const [c, t, d, x, y] of pts) await q(`INSERT INTO observation_points (study_id, code, point_type, description, x_percent, y_percent) VALUES ($1,$2,$3,$4,$5,$6)`, [sid, c, t, d, x, y]);
  for (const [o, d, m] of [['E01', 'X01', 2500], ['E01', 'X02', 3100], ['E02', 'X01', 2800], ['E02', 'X02', 1900]] as const) {
    await q(`INSERT INTO route_distances (study_id, origin_code, destination_code, distance_meters) VALUES ($1,$2,$3,$4)`, [sid, o, d, m]);
  }
  for (const [username, point] of [['e1', 'E01'], ['x1', 'X01'], ['e2', 'E02'], ['x2', 'X02']] as const) {
    await q(`INSERT INTO study_assignments (study_id, user_id, point_code) VALUES ($1,$2,$3)`, [sid, observers[username], point]);
  }
  await resetDemoObservations(q, sid);
  return sid;
}

export interface BootstrapInfo { createdAdmin: boolean; demo: boolean }

/** Idempotent start-up: categories always; first users only when the database has none (fails closed in production). */
export async function bootstrap(db: Db, cfg: Config): Promise<BootstrapInfo> {
  await ensureCategories(db.query);
  const n = (await db.query('SELECT count(*)::int AS n FROM users'))[0].n as number;
  if (n > 0) return { createdAdmin: false, demo: false };

  const demo = cfg.seedDemo;
  const seedPw = cfg.seedPassword ?? (cfg.env !== 'production' ? 'demo-1234' : null);
  if (demo && !seedPw) throw new Error('SEED_DEMO=true in production requires SEED_PASSWORD.');
  const adminPw = cfg.adminPassword ?? (demo ? seedPw : null);
  if (!adminPw) throw new Error('The database has no users: set ADMIN_PASSWORD (min 8 chars) for the first start.');
  if (adminPw.length < 8) throw new Error('ADMIN_PASSWORD must have at least 8 characters.');

  await db.tx(async (q) => {
    const adminId = await createUser(q, cfg.adminUsername, 'Administrator', 'ADMIN', adminPw);
    if (!demo) return;
    await createUser(q, 'sv', 'Eng. Kaveh Mirzai (Supervisor)', 'SUPERVISOR', seedPw!);
    const obs: Record<string, string> = {};
    for (const [u, name] of [['e1', 'Ali Rezaei'], ['x1', 'Maryam Moradi'], ['e2', 'Hossein Tehrani'], ['x2', 'Zahra Karimi']]) {
      obs[u] = await createUser(q, u, name, 'OBSERVER', seedPw!);
    }
    await createDemoStudy(q, adminId, obs);
  });
  return { createdAdmin: true, demo };
}
