import { supabaseAdmin } from './supabase-admin';

const RANKING_KEY = 'ranking-cache:latest';
const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

export const rankingCachePath = () => RANKING_KEY;

export async function recordRankingSnapshot(parsed) {
  const db = supabaseAdmin();
  const updatedAt = new Date().toISOString();
  const payload = {
    version: 2,
    season: parsed?.season || 'Season 2',
    seasonEndsAt: parsed?.seasonEndsAt || null,
    countdown: parsed?.countdown || null,
    rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
    fetchedAt: parsed?.fetchedAt || updatedAt,
    source: parsed?.source || SOURCE,
    updatedAt
  };

  const { error } = await db.from('rep_tracker_kv').upsert({
    key: RANKING_KEY,
    value: payload,
    updated_at: updatedAt
  }, { onConflict: 'key' });

  if (error) throw error;
  return { stored: true, updatedAt, rowCount: payload.rows.length };
}

export async function readRankingSnapshot() {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_kv')
    .select('value,updated_at')
    .eq('key', RANKING_KEY)
    .maybeSingle();
  if (error) throw error;
  const value = data?.value;
  return value && Array.isArray(value.rows) ? value : null;
}

export function rankingStorageHealth() {
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  return { configured, authenticated: configured, durable: configured, provider: 'supabase' };
}
