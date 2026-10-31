import { z } from 'zod';

const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'HH:MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(s)), 'invalid date');
const isoInstant = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'invalid timestamp');
const pointCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,12}$/, 'point code: 1-12 of A-Z 0-9 _ -');
const timezone = z.string().max(60).refine((tz) => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}, 'unknown time zone');

export const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) });

export const userCreateSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'username: 3-32 of a-z 0-9 . _ -'),
  full_name: z.string().trim().min(1).max(100),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OBSERVER']),
  password: z.string().min(8).max(200),
});
export const userPatchSchema = z.object({
  full_name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'OBSERVER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export const studyCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().max(2000).default(''),
  study_date: isoDate,
  start_time: hhmm.default('08:00'),
  end_time: hhmm.default('12:00'),
  timezone: timezone.default('Asia/Tehran'),
  supervisor_name: z.string().max(100).default(''),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).default('DRAFT'),
  retention_days: z.number().int().min(1).max(3650).nullable().optional(),
  audio_enabled: z.boolean().default(true),
});
// NOT studyCreateSchema.partial(): zod still applies .default() to omitted keys, which silently reset status, times, zone...
export const studyPatchSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  study_date: isoDate.optional(),
  start_time: hhmm.optional(),
  end_time: hhmm.optional(),
  timezone: timezone.optional(),
  supervisor_name: z.string().max(100).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED']).optional(),
  retention_days: z.number().int().min(1).max(3650).nullable().optional(),
  audio_enabled: z.boolean().optional(),
});

export const mapCreateSchema = z.object({ name: z.string().trim().min(1).max(60), image: z.string().max(1_600_000).nullable().optional() });
export const mapPatchSchema = z.object({ name: z.string().trim().min(1).max(60).optional(), image: z.string().max(1_600_000).nullable().optional() });

export const pointsSchema = z.object({
  points: z.array(z.object({
    code: pointCode,
    map_id: z.uuid().nullable().optional(),
    point_type: z.enum(['ENTRY', 'EXIT']),
    description: z.string().max(200).default(''),
    x_percent: z.number().min(0).max(100),
    y_percent: z.number().min(0).max(100),
  })).max(40),
  routes: z.array(z.object({
    origin_code: pointCode,
    destination_code: pointCode,
    distance_meters: z.number().min(1).max(200_000),
  })).max(400).default([]),
}).superRefine((v, ctx) => {
  const types = new Map<string, string>();
  for (const p of v.points) {
    if (types.has(p.code)) ctx.addIssue({ code: 'custom', message: `duplicate point code ${p.code}`, path: ['points'] });
    types.set(p.code, p.point_type);
  }
  const seen = new Set<string>();
  for (const r of v.routes) {
    if (types.get(r.origin_code) !== 'ENTRY') ctx.addIssue({ code: 'custom', message: `route origin ${r.origin_code} must be an ENTRY point`, path: ['routes'] });
    if (types.get(r.destination_code) !== 'EXIT') ctx.addIssue({ code: 'custom', message: `route destination ${r.destination_code} must be an EXIT point`, path: ['routes'] });
    const k = `${r.origin_code}->${r.destination_code}`;
    if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `duplicate route ${k}`, path: ['routes'] });
    seen.add(k);
  }
});

export const assignmentsSchema = z.object({
  assignments: z.array(z.object({
    user_id: z.uuid(),
    point_code: pointCode,
    period_start: isoInstant.nullable().optional(),
    period_end: isoInstant.nullable().optional(),
  })).max(200),
});

export const categoryCreateSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,24}$/, 'code: A-Z 0-9 _'),
  label_en: z.string().trim().min(1).max(60),
  label_fa: z.string().trim().min(1).max(60),
  sort_order: z.number().int().min(0).max(1000).default(100),
});
export const categoryPatchSchema = z.object({
  label_en: z.string().trim().min(1).max(60).optional(),
  label_fa: z.string().trim().min(1).max(60).optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

export const observationSchema = z.object({
  study_id: z.uuid(),
  point_code: pointCode.optional(),
  plate_suffix: z.string().min(1).max(12),
  vehicle_category: z.string().trim().toUpperCase().max(24).optional(),
  vehicle_color: z.string().trim().max(20).optional(),
  observed_at: isoInstant.optional(),
  idempotency_key: z.string().min(8).max(80),
  // optional short voice clip of this passage (base64, <= ~200 KB decoded); kept as evidence for supervisors
  audio_b64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(1_000_000).optional(), // larger than the limit below is accepted and then dropped, so a sighting is never refused because of its clip
  audio_mime: z.string().max(60).optional(),
  audio_ms: z.number().int().min(0).max(30_000).optional(),
});
export const correctSchema = z.object({ plate_suffix: z.string().min(1).max(12), reason: z.string().trim().max(200).optional() });
export const batchSchema = z.object({ observations: z.array(observationSchema).min(1).max(500) });
export const voidSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const matchSchema = z.object({
  min_travel_time_sec: z.number().min(0).max(7200).default(30),
  max_travel_time_sec: z.number().min(1).max(14400).default(900),
  strict_category_match: z.boolean().default(false),
  interval_minutes: z.number().int().min(1).max(240).default(15),
  filters: z.object({
    from: isoInstant.optional(),
    to: isoInstant.optional(),
    categories: z.array(z.string().max(24)).max(30).optional(),
    points: z.array(z.string().max(12)).max(40).optional(),
  }).optional(),
}).refine((v) => v.max_travel_time_sec >= v.min_travel_time_sec, { message: 'max travel time must be >= min travel time' });

export const reviewSchema = z.object({
  entry_observation_id: z.uuid(),
  exit_observation_id: z.uuid(),
  decision: z.enum(['REVIEWED', 'REJECTED']),
  note: z.string().trim().max(300).optional(),
});

export type MatchParams = z.infer<typeof matchSchema>;
