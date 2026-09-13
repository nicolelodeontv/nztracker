import { supabaseAdmin, isSupabaseConfigured } from './supabase.mjs';

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

export function dbStatus() {
  return { configured: isSupabaseConfigured(), provider: 'supabase' };
}

export async function upsertClans(rows, season, capturedAt) {
  const db = supabaseAdmin();
  if (!db) return { stored: false, reason: 'Supabase is not configured', count: 0 };

  const records = rows.map((row) => ({
    clan_id: row.clanId || `${season}:${row.clan}`,
    season,
    rank: row.rank,
    clan: row.clan,
    clan_name: row.clan,
    master: row.master || null,
    member_current: row.memberCurrent || 0,
    member_max: row.memberMax || 0,
    members: row.memberCurrent || 0,
    reputation: row.reputation || 0,
    source: SOURCE,
    captured_at: capturedAt,
    fetched_at: capturedAt,
    raw_data: row
  }));

  const { error } = await db.from('clan_rankings').upsert(records, { onConflict: 'clan_id,season' });
  if (error) throw error;
  return { stored: true, count: records.length };
}

export async function recordSyncRun({ status, season, rows = 0, membersCount = 0, startedAt, finishedAt, error = null }) {
  const db = supabaseAdmin();
  if (!db) return { stored: false, reason: 'Supabase is not configured' };

  const { error: insertError } = await db.from('sync_runs').insert({
    status,
    season: season || null,
    clans_count: rows,
    members_count: membersCount,
    error_message: error ? String(error) : null,
    started_at: startedAt,
    completed_at: finishedAt
  });

  if (insertError) throw insertError;
  return { stored: true };
}

export async function getClans({ season, limit = 100 }) {
  const db = supabaseAdmin();
  if (!db) return null;

  let query = db.from('clan_rankings')
    .select('clan_id,season,rank,clan,master,member_current,member_max,reputation,captured_at')
    .order('rank', { ascending: true })
    .limit(limit);

  if (season) query = query.eq('season', season);
  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => ({
    clanId: row.clan_id,
    season: row.season,
    rank: row.rank,
    clan: row.clan,
    master: row.master || '',
    memberCurrent: row.member_current || 0,
    memberMax: row.member_max || 0,
    reputation: row.reputation || 0,
    capturedAt: row.captured_at
  }));
}

export async function getLatestSync() {
  const db = supabaseAdmin();
  if (!db) return null;

  const { data, error } = await db.from('sync_runs')
    .select('*')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
