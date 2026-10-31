import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config.ts';
import type { Db } from './db.ts';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
export const COOKIE = 'tl_session';

export type Role = 'ADMIN' | 'SUPERVISOR' | 'OBSERVER';
export interface AuthUser { id: string; username: string; full_name: string; role: Role; token_version: number }

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signSession(cfg: Config, user: { id: string; token_version: number }): { token: string; maxAgeMs: number } {
  const maxAgeMs = cfg.sessionHours * 3600_000;
  const payload = b64(JSON.stringify({ u: user.id, v: user.token_version, e: Date.now() + maxAgeMs }));
  const mac = crypto.createHmac('sha256', cfg.sessionSecret).update(payload).digest('base64url');
  return { token: `${payload}.${mac}`, maxAgeMs };
}

export function readSession(cfg: Config, token: string | undefined): { u: string; v: number } | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const good = crypto.createHmac('sha256', cfg.sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof d.u === 'string' && typeof d.e === 'number' && d.e > Date.now() ? { u: d.u, v: Number(d.v) } : null;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res: Response, cfg: Config, token: string, maxAgeMs: number) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cfg.env === 'production', maxAge: maxAgeMs, path: '/' });
}

/** Loads the user for a valid session cookie (revoked by active=false or a bumped token_version). */
export function sessionLoader(cfg: Config, db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const s = readSession(cfg, parseCookies(req.headers.cookie)[COOKIE]);
      if (s) {
        const rows = await db.query('SELECT id, username, full_name, role, token_version, active FROM users WHERE id = $1', [s.u]);
        const u = rows[0];
        if (u && u.active && u.token_version === s.v) {
          req.user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role, token_version: u.token_version };
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) =>
  req.user ? next() : void res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });

export const requireRole = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return void res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' });
  if (!roles.includes(req.user.role)) return void res.status(403).json({ error: 'Not allowed for your role', code: 'forbidden' });
  next();
};

/** Cross-site requests cannot add a custom header without a CORS preflight (which is never granted). */
export function csrfHeader(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-tl-csrf'] !== '1') return void res.status(403).json({ error: 'Missing CSRF header', code: 'csrf' });
  next();
}
