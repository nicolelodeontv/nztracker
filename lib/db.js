import { neon } from '@neondatabase/serverless';

let sql;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}

export async function ensureSchema() {
  const db = getDb();

  await db`CREATE TABLE IF NOT EXISTS clan_snapshots (
    id BIGSERIAL PRIMARY KEY,
    season TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL,
    rows JSONB NOT NULL
  )`;

  await db`CREATE INDEX IF NOT EXISTS clan_snapshots_fetched_at_idx
    ON clan_snapshots (fetched_at DESC)`;

  await db`CREATE TABLE IF NOT EXISTS member_snapshots (
    id BIGSERIAL PRIMARY KEY,
    clan_id TEXT NOT NULL,
    clan_name TEXT,
    season TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    members JSONB NOT NULL
  )`;

  await db`CREATE INDEX IF NOT EXISTS member_snapshots_lookup_idx
    ON member_snapshots (clan_id, fetched_at DESC)`;

  await db`CREATE TABLE IF NOT EXISTS monitor_runs (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    clans_seen INTEGER NOT NULL DEFAULT 0,
    members_seen INTEGER NOT NULL DEFAULT 0,
    error TEXT
  )`;

  return db;
}
