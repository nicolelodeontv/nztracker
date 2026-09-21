import { supabaseAdmin } from './supabase-admin.js';

const RANKING_KEY = 'ranking-cache:latest';
const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
export const RANKING_HISTORY_SAMPLE_MS = 5 * 60 * 1000;

export const rankingCachePath = () => RANKING_KEY;

export function computeRankingChanges(currentRows = [], previousRows = []) {
  const previous = new Map(
    (Array.isArray(previousRows) ? previousRows : []).map((row) => [String(row.clanId || row.clan || ''), row])
  );
  const changes = {};
  for (const row of Array.isArray(currentRows) ? currentRows : []) {
    const key = String(row.clanId || row.clan || '');
    const old = previous.get(key);
    if (!old) continue;
    const rankDelta = Number(old.rank || 0) - Number(row.rank || 0);
    const reputationDelta = Number(row.reputation || 0) - Number(old.reputation || 0);
    if (rankDelta || reputationDelta) {
      changes[key] = {
        rankDelta,
        reputationDelta,
        fromRank: Number(old.rank || 0),
        toRank: Number(row.rank || 0),
        fromReputation: Number(old.reputation || 0),
        toReputation: Number(row.reputation || 0)
      };
    }
  }
  return changes;
}

export function globalRankSummary(rows = [], clanId) {
  const ranking = Array.isArray(rows) ? rows.slice().sort((a, b) => Number(a.rank || 9999) - Number(b.rank || 9999)) : [];
  const index = ranking.findIndex((row) => String(row.clanId || '') === String(clanId || ''));
  if (index < 0) return null;
  const current = ranking[index];
  const above = ranking[index - 1] || null;
  const below = ranking[index + 1] || null;
  return {
    rank: Number(current.rank || index + 1),
    reputation: Number(current.reputation || 0),
    clan: current.clan,
    members: Number(current.memberCurrent || 0),
    maxMembers: Number(current.memberMax || 0),
    above: above ? {
      rank: Number(above.rank || 0),
      clan: above.clan,
      reputation: Number(above.reputation || 0),
      gap: Math.max(0, Number(above.reputation || 0) - Number(current.reputation || 0))
    } : null,
    below: below ? {
      rank: Number(below.rank || 0),
      clan: below.clan,
      reputation: Number(below.reputation || 0),
      gap: Math.max(0, Number(current.reputation || 0) - Number(below.reputation || 0))
    } : null
  };
}

async function readHistorySampleMarker(db) {
  const { data, error } = await db
    .from('rep_tracker_kv')
    .select('value,updated_at')
    .eq('key', RANKING_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.value && typeof data.value === 'object' ? data.value : null;
}

async function storeRankingHistory(db, rows, season, capturedAt) {
  if (!Array.isArray(rows) || !rows.length || !season) return { stored: false, count: 0 };
  const records = rows.map((row) => ({
    season,
    clan_id: String(row.clanId || row.clan || ''),
    rank: Number(row.rank || 0),
    clan_name: String(row.clan || ''),
    master: row.master || null,
    member_current: Number(row.memberCurrent || 0),
    member_max: Number(row.memberMax || 0),
    reputation: Number(row.reputation || 0),
    source: row.source || SOURCE,
    snapshot_at: capturedAt,
    raw_data: row.rawData || row
  })).filter((row) => row.clan_id && row.clan_name && row.rank > 0);

  if (!records.length) return { stored: false, count: 0 };
  const { error } = await db.from('rep_tracker_ranking_history').upsert(records, {
    onConflict: 'season,clan_id,snapshot_at',
    ignoreDuplicates: true
  });
  if (error) throw error;
  return { stored: true, count: records.length };
}

async function pruneRankingHistory(db, olderThanDays = 30) {
  const cutoff = new Date(Date.now() - Math.max(1, Number(olderThanDays) || 30) * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await db.from('rep_tracker_ranking_history')
    .delete({ count: 'exact' })
    .lt('snapshot_at', cutoff);
  if (error) throw error;
  return { deleted: Number(count || 0), cutoff };
}

export async function recordRankingSnapshot(parsed) {
  const db = supabaseAdmin();
  const updatedAt = new Date().toISOString();
  const previous = await readHistorySampleMarker(db);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const previousRows = Array.isArray(previous?.rows) ? previous.rows : [];
  const changes = computeRankingChanges(rows, previousRows);
  const previousFetchedAt = previous?.fetchedAt || null;
  const lastHistoryAt = previous?.lastHistoryAt || null;
  const shouldStoreHistory =
    !lastHistoryAt ||
    (Date.parse(updatedAt) - Date.parse(lastHistoryAt) >= RANKING_HISTORY_SAMPLE_MS) ||
    Object.keys(changes).length > 0;

  let history = { stored: false, count: 0 };
  if (shouldStoreHistory) {
    history = await storeRankingHistory(db, rows, parsed?.season || null, parsed?.fetchedAt || updatedAt);
    try {
      await pruneRankingHistory(db, 30);
    } catch (error) {
      console.warn('Ranking history retention failed', error);
    }
  }

  const payload = {
    version: 3,
    season: parsed?.season || 'Season 2',
    seasonEndsAt: parsed?.seasonEndsAt || null,
    countdown: parsed?.countdown || null,
    rows,
    fetchedAt: parsed?.fetchedAt || updatedAt,
    source: parsed?.source || SOURCE,
    previousRows,
    previousFetchedAt,
    changes,
    lastHistoryAt: shouldStoreHistory ? (parsed?.fetchedAt || updatedAt) : lastHistoryAt,
    updatedAt
  };

  const { error } = await db.from('rep_tracker_kv').upsert({
    key: RANKING_KEY,
    value: payload,
    updated_at: updatedAt
  }, { onConflict: 'key' });

  if (error) throw error;
  return {
    stored: true,
    updatedAt,
    rowCount: rows.length,
    historyStored: Boolean(history.stored),
    historyRows: history.count,
    changedClans: Object.keys(changes).length
  };
}

export async function readRankingSnapshot() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('rep_tracker_kv')
    .select('value,updated_at')
    .eq('key', RANKING_KEY)
    .maybeSingle();
  if (error) throw error;
  const value = data?.value;
  return value && Array.isArray(value.rows) ? value : null;
}

export async function readRankingHistory({ clanId, season, hours = 168, limit = 1000 } = {}) {
  const db = supabaseAdmin();
  const safeHours = Math.min(720, Math.max(1, Number(hours) || 168));
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const cutoff = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
  let query = db.from('rep_tracker_ranking_history')
    .select('season,clan_id,rank,clan_name,master,member_current,member_max,reputation,source,snapshot_at')
    .gte('snapshot_at', cutoff)
    .order('snapshot_at', { ascending: true })
    .limit(safeLimit);
  if (clanId) query = query.eq('clan_id', String(clanId));
  if (season) query = query.eq('season', String(season));
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export function rankingStorageHealth() {
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  return { configured, authenticated: configured, durable: configured, provider: 'supabase' };
}
