import { supabaseAdmin, isSupabaseConfigured } from './supabase.mjs';
import { buildSnapshotCandidates, selectChangedSnapshotRows, selectRetentionIds } from '../app/lib/member-snapshot.mjs';

const GAME_SOURCE = 'https://ninjazenshin.online/';

export const multiDbStatus = () => ({ configured: isSupabaseConfigured(), provider: 'supabase' });

function dbOrNull() {
  return supabaseAdmin();
}

function safeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

export async function upsertLeaderboardRows({ type, season, round = '', rows, capturedAt }) {
  const db = dbOrNull();
  if (!db) return { stored: false, count: 0, reason: 'Supabase is not configured' };
  const cleanRows = safeRows(rows).filter((row) => Number(row?.rank) > 0 && String(row?.playerName || '').trim());
  if (!cleanRows.length || !season) return { stored: false, count: 0, reason: 'No leaderboard rows' };

  const normalizedRound = String(round || '');
  const records = cleanRows.map((row) => ({
    board_type: type,
    season,
    round: normalizedRound,
    rank: Number(row.rank),
    player_name: String(row.playerName || '').trim(),
    score: Number(row.score || 0),
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    title: row.title || null,
    badge: row.badge || null,
    source: row.source || GAME_SOURCE,
    captured_at: capturedAt,
    updated_at: capturedAt,
    raw_data: row.rawData || row
  }));

  const { error } = await db.from('leaderboard_entries').upsert(records, {
    onConflict: 'board_type,season,round,rank'
  });
  if (error) throw error;

  const keepRanks = records.map((record) => record.rank);
  const keepList = `(${keepRanks.join(',')})`;
  const { error: cleanupError } = await db.from('leaderboard_entries')
    .delete()
    .eq('board_type', type)
    .eq('season', season)
    .eq('round', normalizedRound)
    .not('rank', 'in', keepList);
  if (cleanupError) throw cleanupError;

  const historyRecords = records.map(({ captured_at, updated_at, ...record }) => ({
    ...record,
    snapshot_at: capturedAt
  }));
  const { error: historyError } = await db.from('leaderboard_history').insert(historyRecords);
  if (historyError) throw historyError;

  return { stored: true, count: records.length, type, season, round: normalizedRound };
}

export async function recordClanHistory({ rows, season, capturedAt }) {
  const db = dbOrNull();
  if (!db) return { stored: false, count: 0, reason: 'Supabase is not configured' };
  const records = safeRows(rows).filter((row) => row?.clanId || row?.clan).map((row) => ({
    clan_id: String(row.clanId || `name:${String(row.clan).toLowerCase()}`),
    season,
    rank: Number(row.rank || 0),
    clan_name: String(row.clan || ''),
    master: row.master || null,
    member_current: Number(row.memberCurrent || 0),
    member_max: Number(row.memberMax || 0),
    reputation: Number(row.reputation || 0),
    source: GAME_SOURCE,
    snapshot_at: capturedAt,
    raw_data: row.rawData || row
  }));
  if (!records.length) return { stored: false, count: 0, reason: 'No clan rows' };
  const { error } = await db.from('clan_ranking_history').insert(records);
  if (error) throw error;
  return { stored: true, count: records.length };
}

export function buildRepTrackerSnapshotRows({ season, snapshotAt, clanResults }) {
  return buildSnapshotCandidates({ season, snapshotAt, clanResults });
}

async function getPreviousSnapshotMap({ season, clanResults }) {
  const db = dbOrNull();
  if (!db || !season) return new Map();

  const pairs = [];
  const seen = new Set();

  for (const result of safeRows(clanResults)) {
    const clanId = String(result?.clanId || '').trim();
    if (!clanId) continue;
    for (const member of safeRows(result.members)) {
      const memberId = String(member?.id || '').trim();
      if (!memberId || member?.identityAmbiguous) continue;
      const key = `${clanId}:${memberId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ clanId, memberId });
    }
  }

  const results = await Promise.all(pairs.map(async ({ clanId, memberId }) => {
    const { data, error } = await db.from('rep_tracker_snapshots')
      .select('clan_id,member_id,reputation,level,stamina,max_stamina,captured_at')
      .eq('clan_id', clanId)
      .eq('season', season)
      .eq('member_id', memberId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }));

  return new Map(results.filter(Boolean).map((row) => [
    `${row.clan_id}:${row.member_id}`,
    row
  ]));
}

async function pruneRepTrackerSnapshots({ olderThanDays = 30, batchSize = 500 }) {
  const db = dbOrNull();
  if (!db) return { deleted: 0, batches: 0, cutoff: null };

  const days = Math.max(1, Number(olderThanDays) || 30);
  const batch = Math.min(1000, Math.max(1, Number(batchSize) || 500));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let deleted = 0;
  let batches = 0;

  while (true) {
    const { data, error } = await db.from('rep_tracker_snapshots')
      .select('id,captured_at')
      .lt('captured_at', cutoff)
      .order('captured_at', { ascending: true })
      .limit(batch);
    if (error) throw error;

    const ids = selectRetentionIds(data, cutoff);
    if (!ids.length) break;

    const { error: deleteError } = await db.from('rep_tracker_snapshots')
      .delete()
      .in('id', ids);
    if (deleteError) throw deleteError;

    deleted += ids.length;
    batches += 1;
  }

  return { deleted, batches, cutoff };
}

export async function upsertRepTrackerSnapshots({ season, snapshotAt, clanResults }) {
  const db = dbOrNull();
  if (!db) return { stored: false, count: 0, ambiguousNames: [], reason: 'Supabase is not configured' };

  const prepared = buildSnapshotCandidates({ season, snapshotAt, clanResults });
  const previous = prepared.rows.length
    ? await getPreviousSnapshotMap({ season, clanResults })
    : new Map();
  const selected = selectChangedSnapshotRows({
    candidates: prepared.rows,
    previousByKey: previous,
    nowMs: Date.parse(snapshotAt) || Date.now()
  });

  if (selected.rows.length) {
    const { error } = await db.from('rep_tracker_snapshots').insert(selected.rows);
    if (error) throw error;
  }

  const retention = await pruneRepTrackerSnapshots();

  return {
    stored: selected.rows.length > 0,
    count: selected.rows.length,
    newCount: selected.newCount,
    changedCount: selected.changedCount,
    heartbeatCount: selected.heartbeatCount,
    unchangedCount: selected.unchangedCount,
    ambiguousNames: prepared.ambiguousNames,
    retention
  };
}

export async function upsertMemberRoster({ season, snapshotAt, clanResults }) {
  const db = dbOrNull();
  if (!db) return { stored: false, count: 0, joined: 0, left: 0, errors: 0 };
  const successful = safeRows(clanResults).filter((result) => result?.clanId && Array.isArray(result.members) && result.members.some((member) => member?.id && !member?.identityAmbiguous && member?.name) && !result.stale);
  if (!successful.length) return { stored: false, count: 0, joined: 0, left: 0, errors: safeRows(clanResults).length };
  const clanIds = successful.map((result) => String(result.clanId));
  const { data: prior, error: priorError } = await db.from('clan_members')
    .select('clan_id,season,member_id,name,level,reputation,stamina,max_stamina,title,badge,snapshot_at')
    .eq('season', season).in('clan_id', clanIds).limit(25000);
  if (priorError) throw priorError;
  const priorMap = new Map((prior || []).map((member) => [`${member.clan_id}:${member.member_id}`, member]));
  const records = [], events = [];
  let joined = 0;
  for (const result of successful) {
    const recordableMembers = result.members.filter((member) => member?.id && !member?.identityAmbiguous && member?.name);
    for (let index = 0; index < recordableMembers.length; index += 1) {
      const member = recordableMembers[index] || {};
      const memberId = String(member.id || member.name || `member-${index}`).trim();
      const name = String(member.name || '').trim();
      if (!memberId || !name) continue;
      const key = `${result.clanId}:${memberId}`;
      const previous = priorMap.get(key);
      const record = {
        clan_id: String(result.clanId), season, member_id: memberId, name,
        level: Number(member.level || 0), reputation: Number(member.reputation || member.rep || 0),
        stamina: Number.isFinite(Number(member.stamina)) ? Number(member.stamina) : null,
        max_stamina: Number.isFinite(Number(member.maxStamina)) ? Number(member.maxStamina) : null,
        title: member.title || null, badge: member.badge || null,
        source: result.source || GAME_SOURCE, captured_at: result.fetchedAt || snapshotAt,
        snapshot_at: snapshotAt, raw_data: member.rawData || member
      };
      records.push(record);
      if (!previous) {
        joined += 1;
        events.push({ clan_id: String(result.clanId), season, member_id: memberId, member_name: name,
          event_type: 'joined', occurred_at: snapshotAt, previous_data: null, current_data: record });
      }
    }
  }
  if (records.length) {
    const { error } = await db.from('clan_members').upsert(records, { onConflict: 'clan_id,season,member_id' });
    if (error) throw error;
  }
  let left = 0;
  const previousByClan = new Map();
  for (const member of prior || []) {
    const list = previousByClan.get(String(member.clan_id)) || [];
    list.push(member); previousByClan.set(String(member.clan_id), list);
  }
  for (const result of successful) {
    const currentClanKeys = new Set(result.members.filter((member) => member?.id && !member?.identityAmbiguous && member?.name).map((member) => String(member.id).trim()));
    for (const previous of previousByClan.get(String(result.clanId)) || []) {
      if (!currentClanKeys.has(String(previous.member_id))) {
        left += 1;
        events.push({ clan_id: String(result.clanId), season, member_id: String(previous.member_id), member_name: String(previous.name),
          event_type: 'left', occurred_at: snapshotAt, previous_data: previous, current_data: null });
      }
    }
  }
  if (events.length) {
    const { error } = await db.from('clan_member_events').insert(events);
    if (error) throw error;
  }
  return { stored: true, count: records.length, joined, left, events: events.length, errors: safeRows(clanResults).length - successful.length };
}

export async function getLeaderboards({ type, season, round, limit = 100 }) {
  const db = dbOrNull();
  if (!db) return null;
  let query = db.from('leaderboard_entries').select('board_type,season,round,rank,player_name,score,wins,losses,title,badge,source,captured_at')
    .eq('board_type', type).order('rank', { ascending: true }).limit(Math.min(500, Math.max(1, limit)));
  if (season) query = query.eq('season', season);
  if (round !== undefined) query = query.eq('round', String(round));
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({ boardType: row.board_type, season: row.season, round: row.round, rank: row.rank,
    playerName: row.player_name, score: row.score, wins: row.wins, losses: row.losses, title: row.title, badge: row.badge,
    source: row.source, capturedAt: row.captured_at }));
}

export async function getLeaderboardHistory({ type, playerName, season, limit = 200 }) {
  const db = dbOrNull();
  if (!db) return null;
  let query = db.from('leaderboard_history').select('board_type,season,round,rank,player_name,score,wins,losses,title,badge,snapshot_at')
    .eq('board_type', type).order('snapshot_at', { ascending: false }).limit(Math.min(1000, Math.max(1, limit)));
  if (playerName) query = query.ilike('player_name', `%${playerName}%`);
  if (season) query = query.eq('season', season);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function searchPlayers(query, limit = 50) {
  const db = dbOrNull();
  if (!db) return null;
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const [membersResult, pveResult, pvpResult] = await Promise.all([
    db.from('clan_members').select('clan_id,season,member_id,name,level,reputation,title,badge,snapshot_at').ilike('name', `%${q}%`).order('snapshot_at', { ascending: false }).limit(limit),
    db.from('leaderboard_entries').select('board_type,season,round,rank,player_name,score,wins,losses,title,badge,captured_at').eq('board_type', 'pve').ilike('player_name', `%${q}%`).limit(limit),
    db.from('leaderboard_entries').select('board_type,season,round,rank,player_name,score,wins,losses,title,badge,captured_at').eq('board_type', 'pvp').ilike('player_name', `%${q}%`).limit(limit)
  ]);
  for (const result of [membersResult, pveResult, pvpResult]) if (result.error) throw result.error;
  return { members: membersResult.data || [], pve: pveResult.data || [], pvp: pvpResult.data || [] };
}

export async function getClanComparison({ first, second, season }) {
  const db = dbOrNull();
  if (!db) return null;
  const clans = [String(first || ''), String(second || '')].filter(Boolean);
  const { data, error } = await db.from('clan_rankings').select('clan_id,season,rank,clan,master,member_current,member_max,reputation,captured_at')
    .in('clan_id', clans).eq('season', season || 'Season 3');
  if (error) throw error;
  return data || [];
}

export async function getClanHistory({ clanId, season, hours = 168, limit = 500 }) {
  const db = dbOrNull();
  if (!db) return null;
  const cutoff = new Date(Date.now() - Math.min(720, Math.max(1, Number(hours) || 168)) * 3600000).toISOString();
  const { data, error } = await db.from('clan_ranking_history').select('clan_id,season,rank,clan_name,master,member_current,member_max,reputation,snapshot_at')
    .eq('clan_id', String(clanId)).eq('season', season || 'Season 3').gte('snapshot_at', cutoff).order('snapshot_at', { ascending: true })
    .limit(Math.min(5000, Math.max(1, limit)));
  if (error) throw error;
  return data || [];
}

export async function getCurrentMembers({ clanId, season, limit = 1000 }) {
  const db = dbOrNull();
  if (!db) return null;
  const { data, error } = await db.from('clan_members').select('clan_id,season,member_id,name,level,reputation,stamina,max_stamina,title,badge,source,captured_at,snapshot_at')
    .eq('clan_id', String(clanId)).eq('season', season || 'Season 3').order('name', { ascending: true }).limit(Math.min(2000, Math.max(1, limit)));
  if (error) throw error;
  const rows = data || [];
  const latestSnapshot = rows.reduce((max, row) => Math.max(max, new Date(row.snapshot_at || 0).getTime()), 0);
  return rows.filter((row) => new Date(row.snapshot_at || 0).getTime() === latestSnapshot);
}
