import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EngineError, runEngine } from '../engine.ts';

// The Vercel deployment runs the engine as api/engine.py behind HTTP. Serve that very handler locally and call it
// through the same client code the API function uses.
const PORT = 3921;
const URL_ = `http://127.0.0.1:${PORT}/api/engine`;
const TOKEN = 'engine-test-token';
const opts = { pythonBin: 'unused', timeoutMs: 15_000, url: URL_, token: TOKEN };
let child: ChildProcess;

const payload = {
  observations: [
    { id: 'e1', study_id: 's', point_code: 'E01', point_type: 'ENTRY', plate_suffix: '387', observation_timestamp: '2026-10-30T08:15:10Z', vehicle_category: 'CAR' },
    { id: 'x1', study_id: 's', point_code: 'X01', point_type: 'EXIT', plate_suffix: '387', observation_timestamp: '2026-10-30T08:19:20Z', vehicle_category: 'CAR' },
  ],
  route_distances: { 'E01->X01': 2500 },
};

beforeAll(async () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const code = `from http.server import HTTPServer\nfrom api.engine import handler\nHTTPServer(('127.0.0.1', ${PORT}), handler).serve_forever()`;
  child = spawn(py, ['-c', code], { cwd: path.resolve(import.meta.dirname, '..', '..'), env: { ...process.env, ENGINE_TOKEN: TOKEN }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(URL_, { method: 'GET' }); return; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
  throw new Error('engine HTTP server did not start');
}, 30_000);

afterAll(() => { child?.kill(); });

describe('engine over HTTP (serverless transport)', () => {
  it('returns the same report as the CLI engine', async () => {
    const r = await runEngine<any>('report', payload, opts);
    expect(r.summary.matched_journeys).toBe(1);
    expect(r.matches[0].travel_time_seconds).toBe(250);
    expect(r.analytics.route_speeds[0].mean_journey_speed_kmh).toBe(36);
  });

  it('exports CSV', async () => {
    const r = await runEngine<{ csv: string }>('export_csv', payload, opts);
    expect(r.csv).toContain('387');
  });

  it('refuses a missing or wrong token', async () => {
    await expect(runEngine('report', payload, { ...opts, token: 'wrong' })).rejects.toBeInstanceOf(EngineError);
    await expect(runEngine('report', payload, { ...opts, token: null })).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('maps invalid input to an "invalid" error without a traceback', async () => {
    await expect(runEngine('report', { observations: [{ id: 'x' }] }, opts)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('reports an unreachable engine as unavailable', async () => {
    await expect(runEngine('report', payload, { ...opts, url: 'http://127.0.0.1:9/api/engine', timeoutMs: 3000 })).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
