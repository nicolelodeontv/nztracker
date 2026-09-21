import { supabaseAdmin } from './supabase-admin.js';

export const HISTORY_SAMPLE_MS = 5 * 60 * 1000;
export const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const HISTORY_VERSION = 3;
const HISTORY_PREFIX = 'supabase/member-history';
const SYNC_STATUS_KEY = 'sync-status:latest';
const RETENTION_KEY = 'retention:last-run';
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
const RETENTION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const locks = new Map();
let lastRetentionCheckAt = 0;

const normalizeSeason = (season) => String(season || 'Season 2').trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
const normalizeClanId = (clanId) => String(clanId || '').trim();
const asIso = (value) => {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
};
const asMs = (value) => {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
};

export const historyPath = (clanId) => `${HISTORY_PREFIX}/${normalizeClanId(clanId)}`;
export const syncStatusPath = () => SYNC_STATUS_KEY;

export function shouldAddMemberPoint(previous, nowMs, reputation) {
  if (!previous) return true;
  const previousMs = Date.parse(previous.last_point_at);
  if (!Number.isFinite(previousMs)) return true;
  return nowMs - previousMs >= HISTORY_SAMPLE_MS || Number(previous.rep) !== Number(reputation);
}

export function buildMemberHistoryResponse({ clanId, season, version = HISTORY_VERSION, startedAt = null, updatedAt = null, stored = false, members = {} }) {
  return { version, clanId, season, startedAt, updatedAt, stored, members };
}

async function withLock(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  locks.set(key, current);
  try {
    return await current;
  } finally {
    if (locks.get(key) === current) locks.delete(key);
  }
}

function normalizeMember(member, index) {
  const name = String(member?.name ?? '').trim();
  const id = String(member?.id || name || `member-${index}`).trim();
  const rep = Number(member?.reputation ?? member?.rep ?? 0);
  return {
    id,
    name,
    level: Number.isFinite(Number(member?.level)) ? Math.trunc(Number(member.level)) : 0,
    rep: Number.isFinite(rep) ? Math.trunc(rep) : 0
  };
}

export function resolveRetentionDays(options = {}) {
  return Math.max(1, Number(options?.olderThanDays) || 30);
}

async function runRetention(db, nowMs, options = {}) {
  if (nowMs - lastRetentionCheckAt < RETENTION_CHECK_INTERVAL_MS) return { deleted: 0, skipped: true, cached: true };
  lastRetentionCheckAt = nowMs;
  const { data: guard, error: guardError } = await db
    .from('rep_tracker_kv')
    .select('value,updated_at')
    .eq('key', RETENTION_KEY)
    .maybeSingle();
  if (guardError) throw guardError;

  const lastRunMs = guard?.value?.ranAt ? Date.parse(guard.value.ranAt) : Date.parse(guard?.updated_at || '');
  if (Number.isFinite(lastRunMs) && nowMs - lastRunMs < RETENTION_INTERVAL_MS) {
    return { deleted: 0, skipped: true };
  }

  const retentionDays = resolveRetentionDays(options);
  const cutoff = new Date(nowMs - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { count, error: deleteError } = await db
    .from('rep_tracker_member_points')
    .delete({ count: 'exact' })
    .lt('captured_at', cutoff);
  if (deleteError) throw deleteError;

  const ranAt = new Date(nowMs).toISOString();
  const { error: kvError } = await db.from('rep_tracker_kv').upsert({
    key: RETENTION_KEY,
    value: { ranAt },
    updated_at: ranAt
  }, { onConflict: 'key' });
  if (kvError) throw kvError;

  return { deleted: Number(count || 0), skipped: false };
}

export async function recordMemberSnapshot({ clanId, season, members, capturedAt = Date.now() }) {
  const key = normalizeClanId(clanId);
  if (!key || !Array.isArray(members) || !members.length) {
    return { stored: false, changed: false, reason: 'Invalid snapshot.' };
  }

  return withLock(`history:${key}:${normalizeSeason(season)}`, async () => {
    const db = supabaseAdmin();
    const seasonKey = normalizeSeason(season);
    const nowMs = asMs(capturedAt);
    const capturedIso = asIso(capturedAt);

    const normalized = new Map();
    members.forEach((member, index) => {
      const value = normalizeMember(member, index);
      if (value.name) normalized.set(value.id, value);
    });
    if (!normalized.size) return { stored: false, changed: false, reason: 'No recordable members.' };

    const memberIds = [...normalized.keys()];
    const { data: latestRows, error: latestError } = await db
      .from('rep_tracker_member_latest')
      .select('clan_id,season,member_id,member_name,level,rep,last_point_at,last_seen_at')
      .eq('clan_id', key)
      .eq('season', seasonKey)
      .in('member_id', memberIds);
    if (latestError) throw latestError;

    const previousById = new Map((latestRows || []).map((row) => [String(row.member_id), row]));
    const pointRows = [];
    const latestUpserts = [];
    let changed = false;
    let newCount = 0;
    let changedCount = 0;
    let heartbeatCount = 0;
    let unchangedCount = 0;

    for (const member of normalized.values()) {
      const previous = previousById.get(member.id);
      const addPoint = shouldAddMemberPoint(previous, nowMs, member.rep);

      if (addPoint) {
        pointRows.push({
          clan_id: key,
          season: seasonKey,
          member_id: member.id,
          member_name: member.name,
          level: member.level,
          rep: member.rep,
          captured_at: capturedIso
        });
        changed = true;
        if (!previous) newCount += 1;
        else if (Number(previous.rep) !== member.rep) changedCount += 1;
        else heartbeatCount += 1;
      } else {
        unchangedCount += 1;
      }

      latestUpserts.push({
        clan_id: key,
        season: seasonKey,
        member_id: member.id,
        member_name: member.name,
        level: member.level,
        rep: member.rep,
        last_point_at: addPoint ? capturedIso : previous.last_point_at,
        last_seen_at: capturedIso
      });
    }

    if (pointRows.length) {
      const { error } = await db.from('rep_tracker_member_points').upsert(pointRows, {
        onConflict: 'clan_id,season,member_id,captured_at',
        ignoreDuplicates: true
      });
      if (error) throw error;
    }

    const { error: latestUpsertError } = await db.from('rep_tracker_member_latest').upsert(latestUpserts, {
      onConflict: 'clan_id,season,member_id'
    });
    if (latestUpsertError) throw latestUpsertError;

    const retention = await runRetention(db, nowMs, { olderThanDays: 30 });

    return {
      stored: true,
      changed,
      clanId: key,
      season: seasonKey,
      updatedAt: capturedIso,
      memberCount: normalized.size,
      storedPoints: pointRows.length,
      newCount,
      changedCount,
      heartbeatCount,
      unchangedCount,
      retention
    };
  });
}

async function readAllPoints(db, clanId, season, cutoffIso) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from('rep_tracker_member_points')
      .select('member_id,member_name,level,rep,captured_at')
      .eq('clan_id', clanId)
      .eq('season', season)
      .gte('captured_at', cutoffIso)
      .order('captured_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function readMemberHistory({ clanId, season, hours = 168 }) {
  const key = normalizeClanId(clanId);
  if (!key) throw new Error('A clanId is required.');
  const safeHours = Math.min(168, Math.max(1, Number(hours) || 168));
  const seasonKey = normalizeSeason(season);
  const db = supabaseAdmin();
  const cutoffIso = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();

  const [latestResult, points, firstResult] = await Promise.all([
    db.from('rep_tracker_member_latest')
      .select('member_id,member_name,level,rep,last_point_at,last_seen_at')
      .eq('clan_id', key)
      .eq('season', seasonKey)
      .order('member_name', { ascending: true }),
    readAllPoints(db, key, seasonKey, cutoffIso),
    db.from('rep_tracker_member_points')
      .select('captured_at')
      .eq('clan_id', key)
      .eq('season', seasonKey)
      .order('captured_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  if (latestResult.error) throw latestResult.error;
  if (firstResult.error) throw firstResult.error;

  const latestById = new Map((latestResult.data || []).map((row) => [String(row.member_id), row]));
  const members = {};

  for (const row of points) {
    const id = String(row.member_id);
    const latest = latestById.get(id);
    if (!members[id]) {
      members[id] = {
        name: latest?.member_name || row.member_name,
        level: Number(latest?.level ?? row.level ?? 0),
        points: [],
        lastSeenAt: latest?.last_seen_at || null
      };
    }
    members[id].points.push({
      t: new Date(row.captured_at).getTime(),
      r: Number(row.rep),
      level: Number(row.level || 0),
      name: row.member_name
    });
  }

  const updatedAt = (latestResult.data || []).reduce((latest, row) => {
    const value = Date.parse(row.last_seen_at);
    return Number.isFinite(value) && value > latest ? value : latest;
  }, NaN);

  return buildMemberHistoryResponse({
    clanId: key,
    season: seasonKey,
    version: HISTORY_VERSION,
    startedAt: firstResult.data?.captured_at || null,
    updatedAt: Number.isFinite(updatedAt) ? new Date(updatedAt).toISOString() : null,
    stored: storageHealth().durable,
    members
  });
}

export async function recordSyncStatus(status = {}) {
  const db = supabaseAdmin();
  const updatedAt = new Date().toISOString();
  const payload = { version: 1, ...status, updatedAt };
  const { error } = await db.from('rep_tracker_kv').upsert({
    key: SYNC_STATUS_KEY,
    value: payload,
    updated_at: updatedAt
  }, { onConflict: 'key' });
  if (error) throw error;
  return { stored: true, ...payload };
}

export async function readSyncStatus() {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_kv')
    .select('value,updated_at')
    .eq('key', SYNC_STATUS_KEY)
    .maybeSingle();
  if (error) throw error;
  return data?.value && typeof data.value === 'object'
    ? data.value
    : null;
}

export async function verifyStorageConnection() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from('rep_tracker_kv').select('key').eq('key', SYNC_STATUS_KEY).maybeSingle();
    if (error) throw error;
    return {
      configured: true,
      durable: true,
      authenticated: true,
      provider: 'supabase',
      healthKeyExists: Boolean(data)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
    return {
      configured,
      durable: false,
      authenticated: configured,
      provider: 'supabase',
      error: message
    };
  }
}

export function storageHealth() {
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  return {
    provider: 'supabase',
    configured,
    authenticated: configured,
    durable: configured
  };
}
