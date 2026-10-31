import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRetention, createApp } from './server/app.ts';
import { loadConfig } from './server/config.ts';
import { migrate, openDb } from './server/db.ts';
import { bootstrap } from './server/seed.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
// dev: this file is in the project root; production: the bundle is dist/server.mjs, one level below it
const root = path.basename(here) === 'dist' ? path.dirname(here) : here;

async function main() {
  const cfg = loadConfig();
  const db = await openDb({ databaseUrl: cfg.databaseUrl, dataDir: cfg.databaseUrl ? null : path.resolve(root, cfg.dataDir) });
  const applied = await migrate(db);
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);
  const boot = await bootstrap(db, cfg);
  if (boot.createdAdmin) {
    console.log(`[bootstrap] created administrator "${cfg.adminUsername}"${boot.demo ? ' and the synthetic DEMO study with demo accounts (supervisor, observer01..04)' : ''}.`);
    if (boot.demo && cfg.env !== 'production' && !cfg.seedPassword) console.log('[bootstrap] development password for all demo accounts: demo-1234 (set SEED_PASSWORD to change)');
  }

  const app = createApp(cfg, db);

  if (cfg.env === 'production') {
    const dist = path.resolve(root, 'dist');
    app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, file) => {
      if (/sw\.js$|manifest\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
      else if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    app.get('*', (req, res, next) => (req.path.startsWith('/api/') ? next() : res.sendFile(path.join(dist, 'index.html'))));
  } else {
    const { createServer } = await import('vite'); // dev dependency: never imported in production
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  applyRetention(db).catch((e) => console.error('[retention]', e));
  setInterval(() => applyRetention(db).catch((e) => console.error('[retention]', e)), 6 * 3600_000).unref();

  const server = app.listen(cfg.port, '0.0.0.0', () => console.log(`TrafficLab listening on http://0.0.0.0:${cfg.port} (${cfg.env}, database: ${db.kind})`));
  const stop = () => { server.close(() => db.close().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('[fatal]', err instanceof Error ? err.message : err);
  process.exit(1);
});
