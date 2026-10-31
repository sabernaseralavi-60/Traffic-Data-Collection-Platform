import { migrations } from './migrations/index.ts';

export type Row = Record<string, any>;
export type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;
export type Exec = (sql: string) => Promise<void>;

export interface Db {
  kind: 'pglite' | 'pg';
  query: Query;
  tx<T>(fn: (q: Query, exec: Exec) => Promise<T>): Promise<T>;
  exec: Exec;
  close(): Promise<void>;
}

/** SQL fragment: a timestamptz column as an ISO-8601 UTC string (drivers return Date objects otherwise). */
export const ts = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * One SQL dialect, two drivers: PostgreSQL via `pg` when DATABASE_URL is set (Neon or any managed Postgres),
 * otherwise an embedded PGlite database persisted in `dataDir` (or in memory when dataDir is null, used by tests).
 */
export async function openDb(opts: { databaseUrl: string | null; dataDir: string | null }): Promise<Db> {
  if (opts.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 5 });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
    return {
      kind: 'pg',
      query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
      exec: async (sql) => { await pool.query(sql); },
      tx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const out = await fn(async (s, p) => (await client.query(s, p as any[])).rows, async (s) => { await client.query(s); });
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
  await lite.waitReady;
  return {
    kind: 'pglite',
    query: async (sql, params) => (await lite.query(sql, params as any[])).rows as Row[],
    exec: async (sql) => { await lite.exec(sql); },
    tx: (fn) =>
      lite.transaction((t) => fn(async (s, p) => (await t.query(s, p as any[])).rows as Row[], async (s) => { await t.exec(s); })),
    close: () => lite.close(),
  };
}

/** Applies pending migrations in order, each inside one transaction, recorded in schema_migrations. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied: string[] = [];
  for (const m of migrations) {
    await db.tx(async (q, exec) => {
      if (db.kind === 'pg') await q('SELECT pg_advisory_xact_lock(727274)'); // serialises concurrent starts
      const done = await q('SELECT 1 FROM schema_migrations WHERE version = $1', [m.version]);
      if (done.length) return;
      await exec(m.sql);
      await q('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
      applied.push(m.version);
    });
  }
  return applied;
}
