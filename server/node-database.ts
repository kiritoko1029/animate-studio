import { drizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sqliteSchema from '../db/schema.ts';
import * as pgSchema from '../db/schema-pg.ts';

/**
 * Node-side database bootstrap.
 *
 * - `DATABASE_URL` selects the real PostgreSQL adapter (test/dev/prod parity
 *   with the Cloudflare Hyperdrive deployment).
 * - Otherwise a local SQLite file under `data/` provides credential-free
 *   development and deterministic tests. It is never claimed to be D1.
 *
 * Migrations are plain SQL files applied through a tiny idempotent runner:
 * each statement runs inside the dialect's own transaction bookkeeping and the
 * applied set is recorded, so re-running is safe on both databases.
 */

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../db/migrations-node');

export type NodeDatabase = {
  db: unknown;
  provider: 'sqlite' | 'pg';
  schema: Record<string, unknown>;
  dialect: 'sqlite' | 'pg';
  close: () => Promise<void>;
  reserveClient?: () => Promise<PgPoolClient>;
};

type PgPoolClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
};

export async function createNodeDatabase(env: Record<string, string | undefined> = process.env, options: { file?: string } = {}): Promise<NodeDatabase> {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl) {
    if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
      // A mis-set DATABASE_URL must fail loudly: silently falling back to the
      // local SQLite file would deploy accounts to the wrong database.
      throw new Error('DATABASE_URL must be a postgresql:// URL');
    }
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    const db = drizzlePg(pool, { schema: pgSchema });
    return {
      db,
      provider: 'pg',
      schema: pgSchema as unknown as Record<string, unknown>,
      dialect: 'pg',
      close: async () => { await pool.end(); },
      // Reserving one client keeps migration transactions on a single
      // connection; pool.query could hop between BEGIN and COMMIT.
      reserveClient: () => pool.connect(),
    };
  }
  const file = options.file ?? resolve(dirname(fileURLToPath(import.meta.url)), '../data/studio-accounts.sqlite');
  await mkdir(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema: sqliteSchema });
  return { db, provider: 'sqlite', schema: sqliteSchema as unknown as Record<string, unknown>, dialect: 'sqlite', close: async () => { sqlite.close(); } };
}

type MigrationFile = { name: string; sql: string };

async function loadMigrations(dialect: 'sqlite' | 'pg'): Promise<MigrationFile[]> {
  const entries = await readFile(join(migrationsDir, 'index.json'), 'utf8').then(JSON.parse) as string[];
  const files = entries.filter(name => name.startsWith(dialect === 'pg' ? 'pg' : 'sqlite'));
  return Promise.all(files.map(async name => ({
    name,
    sql: await readFile(join(migrationsDir, name), 'utf8'),
  })));
}

export async function applyNodeMigrations(database: NodeDatabase): Promise<string[]> {
  const migrations = await loadMigrations(database.dialect);
  const applied: string[] = [];
  if (database.dialect === 'sqlite') {
    const sqlite = (database.db as unknown as { $client: import('better-sqlite3').Database }).$client;
    sqlite.exec('CREATE TABLE IF NOT EXISTS studio_migration (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (const migration of migrations) {
      const row = sqlite.prepare('SELECT name FROM studio_migration WHERE name = ?').get(migration.name);
      if (row) continue;
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(migration.sql);
        sqlite.prepare('INSERT INTO studio_migration (name, applied_at) VALUES (?, ?)').run(migration.name, new Date().toISOString());
        sqlite.exec('COMMIT');
        applied.push(migration.name);
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    return applied;
  }
  const pool = (database.db as unknown as { $client: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>; connect: () => Promise<PgPoolClient> } }).$client;
  const client = database.reserveClient ? await database.reserveClient() : await pool.connect();
  try {
    // Serialize concurrent startups so two processes cannot apply the same
    // migration concurrently; the advisory lock auto-releases with the client.
    await client.query('SELECT pg_advisory_lock(917234001)');
    try {
      await client.query('CREATE TABLE IF NOT EXISTS studio_migration (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
      for (const migration of migrations) {
        const existing = await client.query('SELECT name FROM studio_migration WHERE name = $1', [migration.name]);
        if (existing.rows.length) continue;
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO studio_migration (name, applied_at) VALUES ($1, $2)', [migration.name, new Date().toISOString()]);
          await client.query('COMMIT');
          applied.push(migration.name);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(917234001)');
    }
  } finally {
    client.release();
  }
  return applied;
}

export function newPageId() {
  return randomUUID();
}

export function newShareToken() {
  const bytes = randomUUID();
  return bytes.replaceAll('-', '');
}
