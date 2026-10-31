import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/engine.ts (dev) and dist/server.mjs (bundled) both sit one level below the project root
const SCRIPT = path.resolve(here, '..', 'backend', 'trafficlab_engine.py');

export class EngineError extends Error {
  constructor(message: string, readonly kind: 'unavailable' | 'timeout' | 'failed' | 'invalid') {
    super(message);
  }
}

export interface EngineOpts { pythonBin: string; timeoutMs: number; maxParallel?: number; url?: string | null; token?: string | null }

export const engineOptions = (cfg: { pythonBin: string; engineTimeoutMs: number; engineUrl: string | null; engineToken: string | null }, timeoutMs = cfg.engineTimeoutMs): EngineOpts =>
  ({ pythonBin: cfg.pythonBin, timeoutMs, url: cfg.engineUrl, token: cfg.engineToken });

/** Same JSON contract over HTTP (used where the Node process cannot start Python, e.g. Vercel). */
async function runEngineHttp<T>(action: string, payload: unknown, opts: EngineOpts): Promise<T> {
  let res: Response;
  try {
    res = await fetch(opts.url!, { method: 'POST', headers: { 'content-type': 'application/json', 'x-engine-token': opts.token ?? '' }, body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(opts.timeoutMs) });
  } catch (e: any) {
    throw new EngineError(`engine request failed: ${e?.name === 'TimeoutError' ? 'timeout' : e?.message}`, e?.name === 'TimeoutError' ? 'timeout' : 'unavailable');
  }
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  if (res.ok && body) return body as T;
  if (res.status === 422) throw new EngineError(body?.error ?? 'invalid input', 'invalid');
  throw new EngineError(`engine HTTP ${res.status}`, res.status === 401 || res.status === 403 ? 'unavailable' : 'failed');
}

let running = 0;
const waiting: Array<() => void> = [];

async function slot(max: number) {
  if (running >= max) await new Promise<void>((r) => waiting.push(r));
  running++;
}
function release() {
  running--;
  waiting.shift()?.();
}

/** Runs the Python analytical engine: JSON on stdin, JSON on stdout. Bounded time, bounded parallelism. */
export async function runEngine<T = any>(action: 'report' | 'export_csv', payload: unknown, opts: EngineOpts): Promise<T> {
  if (opts.url) return runEngineHttp<T>(action, payload, opts);
  await slot(opts.maxParallel ?? 2);
  try {
    return await new Promise<T>((resolve, reject) => {
      const child = spawn(opts.pythonBin, [SCRIPT, action], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      const out: Buffer[] = [];
      let err = '';
      let size = 0;
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new EngineError('engine timed out', 'timeout')); }, opts.timeoutMs);
      child.stdout.on('data', (d: Buffer) => {
        size += d.length;
        if (size > 80_000_000) { child.kill('SIGKILL'); reject(new EngineError('engine output too large', 'failed')); return; }
        out.push(d);
      });
      child.stderr.on('data', (d) => { err += d.toString().slice(0, 4000); });
      child.on('error', (e) => { clearTimeout(timer); reject(new EngineError(`cannot start ${opts.pythonBin}: ${e.message}`, 'unavailable')); });
      child.on('close', (code) => {
        clearTimeout(timer);
        const text = Buffer.concat(out).toString('utf8');
        if (code === 0) {
          try { resolve(JSON.parse(text)); } catch { reject(new EngineError('engine returned invalid JSON', 'failed')); }
        } else if (code === 2) {
          let msg = 'invalid input';
          try { msg = JSON.parse(text).error ?? msg; } catch { /* keep default */ }
          reject(new EngineError(msg, 'invalid'));
        } else {
          reject(new EngineError(`engine exited with code ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`, 'failed'));
        }
      });
      child.stdin.on('error', () => { /* child died early: reported by close */ });
      child.stdin.end(JSON.stringify(payload), 'utf8');
    });
  } finally {
    release();
  }
}
