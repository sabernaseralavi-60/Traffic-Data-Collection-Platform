import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-Memory Data Store (PostgreSQL / SQLite schema modeled)
interface User {
  id: string;
  username: string;
  full_name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'OBSERVER';
  assigned_point?: string;
  assigned_study_id?: string;
}

interface ObservationPoint {
  id: string;
  code: string;
  point_type: 'ENTRY' | 'EXIT';
  description: string;
  x_percent: number;
  y_percent: number;
}

interface RouteDistance {
  origin_code: string;
  destination_code: string;
  distance_meters: number;
}

interface Study {
  id: string;
  name: string;
  description: string;
  study_date: string;
  start_time: string;
  end_time: string;
  supervisor_name: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DRAFT';
  schematic_type: 'SCHEMATIC_GRID' | 'CUSTOM_IMAGE';
  schematic_image_url?: string;
  points: ObservationPoint[];
  routes: RouteDistance[];
  created_at: string;
}

interface StoredObservation {
  id: string;
  study_id: string;
  point_code: string;
  point_type: 'ENTRY' | 'EXIT';
  plate_suffix: string;
  vehicle_category: string;
  vehicle_color?: string;
  observation_timestamp: string; // ISO 8601 UTC
  observer_id: string;
  observer_name: string;
  idempotency_key: string;
  created_at: string;
}

// Initial Data Seed with realistic Acceptance Scenario
const users: User[] = [
  {
    id: 'u-admin',
    username: 'admin',
    full_name: 'Dr. Sarah Danesh (Admin)',
    role: 'ADMIN',
  },
  {
    id: 'u-sup',
    username: 'supervisor',
    full_name: 'Eng. Kaveh Mirzai (Supervisor)',
    role: 'SUPERVISOR',
  },
  {
    id: 'u-obs1',
    username: 'observer01',
    full_name: 'Ali Rezaei (Observer 1)',
    role: 'OBSERVER',
    assigned_study_id: 'study-01',
    assigned_point: 'E01',
  },
  {
    id: 'u-obs2',
    username: 'observer02',
    full_name: 'Maryam Moradi (Observer 2)',
    role: 'OBSERVER',
    assigned_study_id: 'study-01',
    assigned_point: 'X01',
  },
  {
    id: 'u-obs3',
    username: 'observer03',
    full_name: 'Hossein Tehrani (Observer 3)',
    role: 'OBSERVER',
    assigned_study_id: 'study-01',
    assigned_point: 'E02',
  },
  {
    id: 'u-obs4',
    username: 'observer04',
    full_name: 'Zahra Karimi (Observer 4)',
    role: 'OBSERVER',
    assigned_study_id: 'study-01',
    assigned_point: 'X02',
  },
];

let activeUser: User = users[0]; // Default to Admin for immediate UI exploration

const studies: Study[] = [
  {
    id: 'study-01',
    name: 'Azadi Intersection Network Survey',
    description: 'Entry-Exit cordon study for turning movement estimation and travel time calibration across 4 strategic arterial points.',
    study_date: '2026-10-30',
    start_time: '08:00',
    end_time: '12:00',
    supervisor_name: 'Eng. Kaveh Mirzai',
    status: 'ACTIVE',
    schematic_type: 'SCHEMATIC_GRID',
    points: [
      { id: 'p1', code: 'E01', point_type: 'ENTRY', description: 'Northern Arterial Inbound', x_percent: 25, y_percent: 18 },
      { id: 'p2', code: 'E02', point_type: 'ENTRY', description: 'Western Corridor Inbound', x_percent: 18, y_percent: 75 },
      { id: 'p3', code: 'X01', point_type: 'EXIT', description: 'Eastern Expressway Outbound', x_percent: 82, y_percent: 25 },
      { id: 'p4', code: 'X02', point_type: 'EXIT', description: 'Southern Avenue Outbound', x_percent: 72, y_percent: 82 },
    ],
    routes: [
      { origin_code: 'E01', destination_code: 'X01', distance_meters: 2500 },
      { origin_code: 'E01', destination_code: 'X02', distance_meters: 3100 },
      { origin_code: 'E02', destination_code: 'X01', distance_meters: 2800 },
      { origin_code: 'E02', destination_code: 'X02', distance_meters: 1900 },
    ],
    created_at: new Date().toISOString(),
  },
];

// Observations store
let observations: StoredObservation[] = [
  // Acceptance scenario vehicles pre-loaded:
  // Observer 1 at E01 records plate 387 at 08:15:10
  {
    id: 'obs-entry-387',
    study_id: 'study-01',
    point_code: 'E01',
    point_type: 'ENTRY',
    plate_suffix: '387',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:15:10.000Z',
    observer_id: 'u-obs1',
    observer_name: 'Ali Rezaei',
    idempotency_key: 'seed-e01-387-081510',
    created_at: '2026-10-30T08:15:10.000Z',
  },
  // Observer 2 at X01 records plate 387 at 08:19:20 (Travel time: 250s)
  {
    id: 'obs-exit-387',
    study_id: 'study-01',
    point_code: 'X01',
    point_type: 'EXIT',
    plate_suffix: '387',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:19:20.000Z',
    observer_id: 'u-obs2',
    observer_name: 'Maryam Moradi',
    idempotency_key: 'seed-x01-387-081920',
    created_at: '2026-10-30T08:19:20.000Z',
  },
  // Additional realistic traffic records for OD matrix demonstration:
  {
    id: 'obs-e-542',
    study_id: 'study-01',
    point_code: 'E02',
    point_type: 'ENTRY',
    plate_suffix: '542',
    vehicle_category: 'TAXI',
    observation_timestamp: '2026-10-30T08:15:18.000Z',
    observer_id: 'u-obs3',
    observer_name: 'Hossein Tehrani',
    idempotency_key: 'seed-e02-542-081518',
    created_at: '2026-10-30T08:15:18.000Z',
  },
  {
    id: 'obs-x-542',
    study_id: 'study-01',
    point_code: 'X02',
    point_type: 'EXIT',
    plate_suffix: '542',
    vehicle_category: 'TAXI',
    observation_timestamp: '2026-10-30T08:20:10.000Z',
    observer_id: 'u-obs4',
    observer_name: 'Zahra Karimi',
    idempotency_key: 'seed-x02-542-082010',
    created_at: '2026-10-30T08:20:10.000Z',
  },
  {
    id: 'obs-e-921',
    study_id: 'study-01',
    point_code: 'E01',
    point_type: 'ENTRY',
    plate_suffix: '921',
    vehicle_category: 'BUS',
    observation_timestamp: '2026-10-30T08:15:35.000Z',
    observer_id: 'u-obs1',
    observer_name: 'Ali Rezaei',
    idempotency_key: 'seed-e01-921-081535',
    created_at: '2026-10-30T08:15:35.000Z',
  },
  {
    id: 'obs-x-921',
    study_id: 'study-01',
    point_code: 'X01',
    point_type: 'EXIT',
    plate_suffix: '921',
    vehicle_category: 'BUS',
    observation_timestamp: '2026-10-30T08:21:05.000Z',
    observer_id: 'u-obs2',
    observer_name: 'Maryam Moradi',
    idempotency_key: 'seed-x01-921-082105',
    created_at: '2026-10-30T08:21:05.000Z',
  },
  // Demonstrating leading zero: plate 042
  {
    id: 'obs-e-042',
    study_id: 'study-01',
    point_code: 'E02',
    point_type: 'ENTRY',
    plate_suffix: '042',
    vehicle_category: 'PICKUP',
    observation_timestamp: '2026-10-30T08:16:00.000Z',
    observer_id: 'u-obs3',
    observer_name: 'Hossein Tehrani',
    idempotency_key: 'seed-e02-042-081600',
    created_at: '2026-10-30T08:16:00.000Z',
  },
  {
    id: 'obs-x-042',
    study_id: 'study-01',
    point_code: 'X01',
    point_type: 'EXIT',
    plate_suffix: '042',
    vehicle_category: 'PICKUP',
    observation_timestamp: '2026-10-30T08:21:40.000Z',
    observer_id: 'u-obs2',
    observer_name: 'Maryam Moradi',
    idempotency_key: 'seed-x01-042-082140',
    created_at: '2026-10-30T08:21:40.000Z',
  },
  // Demonstrating ambiguity: two entries with suffix 777, one exit
  {
    id: 'obs-e-777-1',
    study_id: 'study-01',
    point_code: 'E01',
    point_type: 'ENTRY',
    plate_suffix: '777',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:16:20.000Z',
    observer_id: 'u-obs1',
    observer_name: 'Ali Rezaei',
    idempotency_key: 'seed-e01-777-1',
    created_at: '2026-10-30T08:16:20.000Z',
  },
  {
    id: 'obs-e-777-2',
    study_id: 'study-01',
    point_code: 'E02',
    point_type: 'ENTRY',
    plate_suffix: '777',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:17:00.000Z',
    observer_id: 'u-obs3',
    observer_name: 'Hossein Tehrani',
    idempotency_key: 'seed-e02-777-2',
    created_at: '2026-10-30T08:17:00.000Z',
  },
  {
    id: 'obs-x-777-1',
    study_id: 'study-01',
    point_code: 'X01',
    point_type: 'EXIT',
    plate_suffix: '777',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:22:15.000Z',
    observer_id: 'u-obs2',
    observer_name: 'Maryam Moradi',
    idempotency_key: 'seed-x01-777-1',
    created_at: '2026-10-30T08:22:15.000Z',
  },
];

// Helper to execute Python engine
function invokePythonEngine(action: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'backend', 'trafficlab_engine.py');
    const child = spawn('python3', [pythonScript, action]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error('Python engine execution failed:', stderr);
        return reject(new Error(`Python engine exited with code ${code}: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python engine output: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

// -------------------------------------------------------------
// REST API Routes
// -------------------------------------------------------------

// Auth & Current User
app.get('/api/v1/auth/me', (req, res) => {
  res.json({ user: activeUser, allUsers: users });
});

app.post('/api/v1/auth/switch-user', (req, res) => {
  const { userId } = req.body;
  const found = users.find((u) => u.id === userId);
  if (found) {
    activeUser = found;
    res.json({ status: 'success', user: activeUser });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// Studies
app.get('/api/v1/studies', (req, res) => {
  const enriched = studies.map((s) => ({
    ...s,
    observation_count: observations.filter((o) => o.study_id === s.id).length,
  }));
  res.json(enriched);
});

app.get('/api/v1/studies/:id', (req, res) => {
  const study = studies.find((s) => s.id === req.params.id);
  if (!study) return res.status(404).json({ error: 'Study not found' });
  res.json(study);
});

app.post('/api/v1/studies', (req, res) => {
  const newStudy: Study = {
    id: `study-${Date.now()}`,
    name: req.body.name || 'New Traffic Survey',
    description: req.body.description || '',
    study_date: req.body.study_date || new Date().toISOString().split('T')[0],
    start_time: req.body.start_time || '08:00',
    end_time: req.body.end_time || '12:00',
    supervisor_name: req.body.supervisor_name || activeUser.full_name,
    status: 'ACTIVE',
    schematic_type: req.body.schematic_type || 'SCHEMATIC_GRID',
    schematic_image_url: req.body.schematic_image_url,
    points: req.body.points || [
      { id: `p-${Date.now()}-1`, code: 'E01', point_type: 'ENTRY', description: 'North Inbound', x_percent: 30, y_percent: 20 },
      { id: `p-${Date.now()}-2`, code: 'X01', point_type: 'EXIT', description: 'South Outbound', x_percent: 70, y_percent: 80 },
    ],
    routes: req.body.routes || [
      { origin_code: 'E01', destination_code: 'X01', distance_meters: 2000 },
    ],
    created_at: new Date().toISOString(),
  };
  studies.unshift(newStudy);
  res.status(201).json(newStudy);
});

app.put('/api/v1/studies/:id/points', (req, res) => {
  const study = studies.find((s) => s.id === req.params.id);
  if (!study) return res.status(404).json({ error: 'Study not found' });

  if (Array.isArray(req.body.points)) {
    study.points = req.body.points;
  }
  if (Array.isArray(req.body.routes)) {
    study.routes = req.body.routes;
  }
  res.json(study);
});

// Observations
app.get('/api/v1/studies/:id/observations', (req, res) => {
  const studyObs = observations
    .filter((o) => o.study_id === req.params.id)
    .sort((a, b) => new Date(b.observation_timestamp).getTime() - new Date(a.observation_timestamp).getTime());
  res.json(studyObs);
});

app.post('/api/v1/observations', (req, res) => {
  const {
    study_id,
    point_code,
    point_type,
    plate_suffix,
    vehicle_category,
    vehicle_color,
    observation_timestamp,
    idempotency_key,
  } = req.body;

  if (!study_id || !point_code || !plate_suffix) {
    return res.status(400).json({ error: 'Missing mandatory fields (study_id, point_code, plate_suffix)' });
  }

  // Idempotency check to prevent duplicate submission
  const existing = observations.find((o) => o.idempotency_key && o.idempotency_key === idempotency_key);
  if (existing) {
    return res.json({ status: 'idempotent_duplicate', observation: existing });
  }

  // Suffix formatting (pad to 3 digits)
  const cleanSuffix = String(plate_suffix).replace(/\D/g, '').padStart(3, '0').slice(-3);

  const newObs: StoredObservation = {
    id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    study_id,
    point_code: String(point_code).toUpperCase(),
    point_type: (point_type || 'ENTRY').toUpperCase() as 'ENTRY' | 'EXIT',
    plate_suffix: cleanSuffix,
    vehicle_category: (vehicle_category || 'CAR').toUpperCase(),
    vehicle_color: vehicle_color || undefined,
    observation_timestamp: observation_timestamp || new Date().toISOString(),
    observer_id: activeUser.id,
    observer_name: activeUser.full_name,
    idempotency_key: idempotency_key || `key-${Date.now()}-${Math.random()}`,
    created_at: new Date().toISOString(),
  };

  observations.push(newObs);
  res.status(201).json({ status: 'success', observation: newObs });
});

app.post('/api/v1/observations/batch-sync', (req, res) => {
  const items: any[] = req.body.observations || [];
  const added: StoredObservation[] = [];
  const duplicates: string[] = [];

  for (const item of items) {
    if (!item.plate_suffix || !item.point_code) continue;
    const existing = observations.find((o) => o.idempotency_key && o.idempotency_key === item.idempotency_key);
    if (existing) {
      duplicates.push(item.idempotency_key);
      continue;
    }
    const cleanSuffix = String(item.plate_suffix).replace(/\D/g, '').padStart(3, '0').slice(-3);
    const newObs: StoredObservation = {
      id: item.id || `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      study_id: item.study_id || 'study-01',
      point_code: String(item.point_code).toUpperCase(),
      point_type: (item.point_type || 'ENTRY').toUpperCase() as 'ENTRY' | 'EXIT',
      plate_suffix: cleanSuffix,
      vehicle_category: (item.vehicle_category || 'CAR').toUpperCase(),
      vehicle_color: item.vehicle_color,
      observation_timestamp: item.observation_timestamp || new Date().toISOString(),
      observer_id: item.observer_id || activeUser.id,
      observer_name: activeUser.full_name,
      idempotency_key: item.idempotency_key || `sync-${Date.now()}-${Math.random()}`,
      created_at: new Date().toISOString(),
    };
    observations.push(newObs);
    added.push(newObs);
  }

  res.json({
    status: 'success',
    synced_count: added.length,
    duplicate_count: duplicates.length,
    added_ids: added.map((a) => a.id),
  });
});

app.delete('/api/v1/observations/:id', (req, res) => {
  const index = observations.findIndex((o) => o.id === req.params.id);
  if (index !== -1) {
    observations.splice(index, 1);
    res.json({ status: 'deleted' });
  } else {
    res.status(404).json({ error: 'Observation not found' });
  }
});

// Seed scenario reset
app.post('/api/v1/studies/:id/seed-scenario', (req, res) => {
  const studyId = req.params.id;
  // Remove existing obs for this study
  observations = observations.filter((o) => o.study_id !== studyId);

  // Add 15 clean synthetic vehicle pairs including the acceptance test scenario
  const samplePairs = [
    { suffix: '387', cat: 'CAR', ePoint: 'E01', xPoint: 'X01', eTime: '2026-10-30T08:15:10Z', xTime: '2026-10-30T08:19:20Z' },
    { suffix: '542', cat: 'TAXI', ePoint: 'E02', xPoint: 'X02', eTime: '2026-10-30T08:15:18Z', xTime: '2026-10-30T08:20:10Z' },
    { suffix: '921', cat: 'BUS', ePoint: 'E01', xPoint: 'X01', eTime: '2026-10-30T08:15:35Z', xTime: '2026-10-30T08:21:05Z' },
    { suffix: '042', cat: 'PICKUP', ePoint: 'E02', xPoint: 'X01', eTime: '2026-10-30T08:16:00Z', xTime: '2026-10-30T08:21:40Z' },
    { suffix: '118', cat: 'MOTORCYCLE', ePoint: 'E01', xPoint: 'X02', eTime: '2026-10-30T08:17:10Z', xTime: '2026-10-30T08:22:10Z' },
    { suffix: '633', cat: 'HEAVY TRUCK', ePoint: 'E02', xPoint: 'X01', eTime: '2026-10-30T08:18:00Z', xTime: '2026-10-30T08:24:30Z' },
    { suffix: '409', cat: 'CAR', ePoint: 'E01', xPoint: 'X01', eTime: '2026-10-30T08:19:00Z', xTime: '2026-10-30T08:23:45Z' },
    { suffix: '855', cat: 'VAN', ePoint: 'E02', xPoint: 'X02', eTime: '2026-10-30T08:20:15Z', xTime: '2026-10-30T08:25:20Z' },
    { suffix: '204', cat: 'CAR', ePoint: 'E01', xPoint: 'X02', eTime: '2026-10-30T08:21:10Z', xTime: '2026-10-30T08:27:00Z' },
    { suffix: '913', cat: 'TAXI', ePoint: 'E01', xPoint: 'X01', eTime: '2026-10-30T08:22:00Z', xTime: '2026-10-30T08:26:10Z' },
  ];

  samplePairs.forEach((p, idx) => {
    observations.push({
      id: `seed-e-${idx}-${p.suffix}`,
      study_id: studyId,
      point_code: p.ePoint,
      point_type: 'ENTRY',
      plate_suffix: p.suffix,
      vehicle_category: p.cat,
      observation_timestamp: p.eTime,
      observer_id: 'u-obs1',
      observer_name: 'Ali Rezaei',
      idempotency_key: `seed-e-${idx}-${p.suffix}`,
      created_at: p.eTime,
    });
    observations.push({
      id: `seed-x-${idx}-${p.suffix}`,
      study_id: studyId,
      point_code: p.xPoint,
      point_type: 'EXIT',
      plate_suffix: p.suffix,
      vehicle_category: p.cat,
      observation_timestamp: p.xTime,
      observer_id: 'u-obs2',
      observer_name: 'Maryam Moradi',
      idempotency_key: `seed-x-${idx}-${p.suffix}`,
      created_at: p.xTime,
    });
  });

  // Also add two ambiguous entries with suffix 777
  observations.push({
    id: 'seed-e-ambig-1',
    study_id: studyId,
    point_code: 'E01',
    point_type: 'ENTRY',
    plate_suffix: '777',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:16:20Z',
    observer_id: 'u-obs1',
    observer_name: 'Ali Rezaei',
    idempotency_key: 'seed-e-ambig-1',
    created_at: '2026-10-30T08:16:20Z',
  });
  observations.push({
    id: 'seed-e-ambig-2',
    study_id: studyId,
    point_code: 'E02',
    point_type: 'ENTRY',
    plate_suffix: '777',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:17:00Z',
    observer_id: 'u-obs3',
    observer_name: 'Hossein Tehrani',
    idempotency_key: 'seed-e-ambig-2',
    created_at: '2026-10-30T08:17:00Z',
  });
  observations.push({
    id: 'seed-x-ambig-1',
    study_id: studyId,
    point_code: 'X01',
    point_type: 'EXIT',
    plate_suffix: '777',
    vehicle_category: 'CAR',
    observation_timestamp: '2026-10-30T08:22:15Z',
    observer_id: 'u-obs2',
    observer_name: 'Maryam Moradi',
    idempotency_key: 'seed-x-ambig-1',
    created_at: '2026-10-30T08:22:15Z',
  });

  res.json({ status: 'seeded', observation_count: observations.length });
});

// Python Analytical & Matching Execution Bridge
app.post('/api/v1/studies/:id/match', async (req, res) => {
  const studyId = req.params.id;
  const study = studies.find((s) => s.id === studyId);
  const studyObs = observations.filter((o) => o.study_id === studyId);

  // Build route distance map
  const routeDistances: Record<string, number> = {};
  if (study && study.routes) {
    for (const r of study.routes) {
      routeDistances[`${r.origin_code}->${r.destination_code}`] = r.distance_meters;
    }
  }

  const payload = {
    observations: studyObs,
    min_travel_time_sec: req.body.min_travel_time_sec || 30.0,
    max_travel_time_sec: req.body.max_travel_time_sec || 900.0,
    strict_category_match: Boolean(req.body.strict_category_match),
    route_distances: routeDistances,
  };

  try {
    const matchOutput = await invokePythonEngine('match', payload);
    const analyticsOutput = await invokePythonEngine('analytics', { matches: matchOutput.matches });

    res.json({
      ...matchOutput,
      analytics: analyticsOutput,
    });
  } catch (err: any) {
    console.error('Matching failed:', err);
    res.status(500).json({ error: err.message || 'Python matching engine failed' });
  }
});

// Export CSV / Excel Download
app.get('/api/v1/studies/:id/export', async (req, res) => {
  const studyId = req.params.id;
  const study = studies.find((s) => s.id === studyId);
  const studyObs = observations.filter((o) => o.study_id === studyId);

  const routeDistances: Record<string, number> = {};
  if (study && study.routes) {
    for (const r of study.routes) {
      routeDistances[`${r.origin_code}->${r.destination_code}`] = r.distance_meters;
    }
  }

  try {
    const matchOutput = await invokePythonEngine('match', {
      observations: studyObs,
      route_distances: routeDistances,
    });

    const exportOutput = await invokePythonEngine('export_csv', {
      matches: matchOutput.matches,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="TrafficLab_${studyId}_Report.csv"`);
    res.send(exportOutput.csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware in dev or static serving
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TrafficLab server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
