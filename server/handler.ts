import type { Express } from 'express';
import { applyRetention, createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { migrate, openDb } from './db.ts';
import { bootstrap } from './seed.ts';

let ready: Promise<Express> | null = null;

async function init(): Promise<Express> {
  // Vercel's Neon integration names the pooled connection string POSTGRES_URL
  if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;
  const cfg = loadConfig();
  if (!cfg.databaseUrl) throw new Error('DATABASE_URL (or POSTGRES_URL) is required on a serverless host: the embedded database is not shared between function instances.');
  const db = await openDb({ databaseUrl: cfg.databaseUrl, dataDir: null });
  await migrate(db);
  const boot = await bootstrap(db, cfg);
  if (boot.createdAdmin) console.log(`[bootstrap] created administrator "${cfg.adminUsername}"${boot.demo ? ' and the DEMO study with demo accounts' : ''}`);
  applyRetention(db).catch((e) => console.error('[retention]', e)); // no timers in serverless: run on each cold start
  return createApp(cfg, db);
}

/** Serverless entry: initialise once per function instance, retry after a failed start. */
export function getApp(): Promise<Express> {
  ready ??= init().catch((e) => { ready = null; throw e; });
  return ready;
}
