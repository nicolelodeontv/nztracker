import { supabaseAdmin } from './supabase-admin';
import { discoverChaos, fetchLiveMembers } from './ninja-source.mjs';

const FRESH_MS = 60_000;
const AGING_MS = 300_000;
const DAY_MS = 86_400_000;
const syncLocks = new Map();

const nowIso = () => new Date().toISOString();
const safeText = (value) => String(value ?? '').trim();
const asInt = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;

export function freshness(iso) {
  if (!iso) return { status: 'offline', ageSeconds: null };
  const ageMs = Math.max(0, Date.now() - new Date(iso).getTime());
  return { status: ageMs <= FRESH_MS ? 'live' : ageMs <= AGING_MS ? 'aging' : 'stale', ageSeconds: Math.floor(ageMs / 1000) };
}

export async function getConfig() {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_config').select('*').eq('id', 'main').maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureSeason(config, season, clanId, startedAt = nowIso()) {
  const db = supabaseAdmin();
  const { data: existing } = await db.from('rep_tracker_seasons').select('*').eq('season', season).maybeSingle();
  if (existing) return existing;
  const { data, error } = await db.from('rep_tracker_seasons').insert({ season, clan_id: clanId, started_at: startedAt, status: 'active' }).select('*').single();
  if (error) throw error;
  return data;
}

async function updateConfig(values) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_config').upsert({ id: 'main', ...values, updated_at: nowIso() }).select('*').single();
  if (error) throw error;
  return data;
}

async function audit(action, details = {}, admin = 'system') {
  try { await supabaseAdmin().from('rep_tracker_audit_log').insert({ action, admin, details }); } catch (error) { console.warn('Audit write failed', error); }
}

async function upsertMembers({ clanId, season, members, capturedAt }) {
  const db = supabaseAdmin();
  const memberRows = members.filter((member) => member.id).map((member) => ({
    clan_id: clanId, member_id: member.id, current_ign: member.name, current_level: asInt(member.level), last_seen_at: capturedAt, updated_at: capturedAt,
  }));
  if (!memberRows.length) return;
  const { data: existingRows, error: existingError } = await db.from('rep_tracker_members').select('*').eq('clan_id', clanId).in('member_id', memberRows.map((row) => row.member_id));
  if (existingError) throw existingError;
  const existing = new Map((existingRows || []).map((row) => [String(row.member_id), row]));
  for (const row of memberRows) {
    const prev = existing.get(String(row.member_id));
    const payload = prev ? row : { ...row, first_seen_at: capturedAt, created_at: capturedAt };
    if (prev && prev.current_ign !== row.current_ign) {
      await db.from('rep_tracker_member_events').insert({ clan_id: clanId, season, member_id: row.member_id, event_type: 'renamed', previous_data: { ign: prev.current_ign, level: prev.current_level }, current_data: { ign: row.current_ign, level: row.current_level }, occurred_at: capturedAt });
    } else if (!prev) {
      await db.from('rep_tracker_member_events').insert({ clan_id: clanId, season, member_id: row.member_id, event_type: 'joined', previous_data: null, current_data: { ign: row.current_ign, level: row.current_level }, occurred_at: capturedAt });
    }
    const { error } = await db.from('rep_tracker_members').upsert(payload, { onConflict: 'clan_id,member_id' });
    if (error) throw error;
  }
}

async function previousSnapshotMap(clanId, season, memberIds, capturedAt) {
  if (!memberIds.length) return new Map();
  const db = supabaseAdmin();
  const before = new Date(new Date(capturedAt).getTime() - 1000).toISOString();
  const { data, error } = await db.from('rep_tracker_snapshots').select('member_id,reputation,captured_at').eq('clan_id', clanId).eq('season', season).in('member_id', memberIds).lt('captured_at', before).order('captured_at', { ascending: false }).limit(memberIds.length * 2);
  if (error) throw error;
  const out = new Map();
  for (const row of data || []) if (!out.has(String(row.member_id))) out.set(String(row.member_id), row);
  return out;
}

export async function syncTracker({ force = false, admin = 'system' } = {}) {
  const lockKey = 'main';
  if (syncLocks.has(lockKey)) return syncLocks.get(lockKey);
  const task = (async () => {
    const started = Date.now();
    const db = supabaseAdmin();
    let config = await getConfig();
    let discovery;
    try {
      discovery = await discoverChaos();
      config = await updateConfig({
        clan_id: discovery.clanId,
        clan_name: discovery.clanName,
        current_season: discovery.currentSeason || config?.current_season || null,
        final_day_at: discovery.finalDayAt || config?.final_day_at || null,
        expected_member_count: discovery.expectedMemberCount || config?.expected_member_count || null,
      });
    } catch (error) {
      await audit('Sync discovery failed', { message: error instanceof Error ? error.message : String(error) }, admin);
      throw new Error(`Clan discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const season = config.current_season || discovery.currentSeason;
    if (!season) throw new Error('Live source did not expose a season and no season is configured.');
    await ensureSeason(config, season, config.clan_id, discovery.capturedAt);

    const last = await db.from('rep_tracker_sync_runs').select('completed_at,status').eq('clan_id', config.clan_id).order('completed_at', { ascending: false }).limit(1).maybeSingle();
    const lastCompleted = last.data?.completed_at ? Date.parse(last.data.completed_at) : 0;
    if (!force && lastCompleted && Date.now() - lastCompleted < Math.max(30, config.sync_interval_seconds || 45) * 1000) {
      return { reused: true, config };
    }

    const run = await db.from('rep_tracker_sync_runs').insert({ status: 'failed', source: 'Ninja Zenshin', season, clan_id: config.clan_id, started_at: new Date(started).toISOString() }).select('*').single();
    const runId = run.data?.id;
    try {
      const live = await fetchLiveMembers(config.clan_id);
      const capturedAt = live.fetchedAt || nowIso();
      const expected = Number(config.expected_member_count || 0);
      const returned = live.members.length;
      const memberIds = live.members.map((m) => String(m.id)).filter(Boolean);
      if (!memberIds.length) throw new Error('Live source returned members without stable member IDs.');
      if (expected > 0 && returned < expected) throw new Error(`Incomplete live roster: ${returned} returned, ${expected} expected.`);

      const previous = await previousSnapshotMap(config.clan_id, season, memberIds, capturedAt);
      const snapshotRows = live.members.map((member) => {
        const prev = previous.get(String(member.id));
        const previousRep = prev ? Number(prev.reputation) : null;
        const suspicious = previousRep !== null && Number(member.reputation) < previousRep;
        return {
          clan_id: config.clan_id, season, member_id: String(member.id), ign: member.name, level: asInt(member.level), reputation: asInt(member.reputation),
          stamina: member.stamina == null ? null : asInt(member.stamina), max_stamina: member.maxStamina == null ? null : asInt(member.maxStamina),
          source: live.service === 'legacy-live' ? 'Ninja Zenshin public member endpoint' : 'Ninja Zenshin AMF', captured_at: capturedAt,
          suspicious, suspicious_reason: suspicious ? `REP decreased from ${previousRep} to ${member.reputation}. Raw value retained for audit.` : null, raw_data: member,
        };
      });
      const { error: insertError } = await db.from('rep_tracker_snapshots').upsert(snapshotRows, { onConflict: 'clan_id,season,member_id,captured_at' });
      if (insertError) throw insertError;
      await upsertMembers({ clanId: config.clan_id, season, members: live.members, capturedAt });
      await db.from('rep_tracker_members').update({ last_seen_at: capturedAt }).eq('clan_id', config.clan_id).not('member_id', 'in', `(${memberIds.map((id) => `"${id}"`).join(',')})`).maybeSingle();
      await db.from('rep_tracker_sync_runs').update({ status: 'success', members_returned: returned, members_expected: expected || null, completed_at: capturedAt, details: { service: live.service, source: live.source } }).eq('id', runId);
      await audit('Live sync completed', { clanId: config.clan_id, season, returned, expected, service: live.service }, admin);
      return { reused: false, live, config, season, suspiciousCount: snapshotRows.filter((r) => r.suspicious).length };
    } catch (error) {
      await db.from('rep_tracker_sync_runs').update({ status: 'failed', completed_at: nowIso(), error_message: error instanceof Error ? error.message : String(error) }).eq('id', runId);
      throw error;
    }
  })();
  syncLocks.set(lockKey, task);
  try { return await task; } finally { syncLocks.delete(lockKey); }
}

async function latestSnapshots(clanId, season) {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_snapshots').select('*').eq('clan_id', clanId).eq('season', season).order('captured_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const out = new Map();
  for (const row of data || []) if (!out.has(String(row.member_id))) out.set(String(row.member_id), row);
  return [...out.values()];
}

export async function dashboardData() {
  const config = await getConfig();
  if (!config?.clan_id || !config?.current_season) return { configured: false, config };
  const db = supabaseAdmin();
  const season = config.current_season;
  const snapshots = await latestSnapshots(config.clan_id, season);
  const ids = snapshots.map((row) => String(row.member_id));
  const { data: baselines } = await db.from('rep_tracker_baselines').select('*').eq('clan_id', config.clan_id).eq('season', season).in('member_id', ids.length ? ids : ['_']);
  const baselineMap = new Map((baselines || []).map((row) => [String(row.member_id), row]));
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const { data: dayRows } = await db.from('rep_tracker_snapshots').select('member_id,reputation').eq('clan_id', config.clan_id).eq('season', season).gte('captured_at', since.toISOString()).order('captured_at', { ascending: true }).limit(Math.max(ids.length, 1));
  const dayMap = new Map(); for (const row of dayRows || []) if (!dayMap.has(String(row.member_id))) dayMap.set(String(row.member_id), Number(row.reputation));
  const { data: hoursRows } = await db.from('rep_tracker_hours').select('member_id,total_hours').eq('clan_id', config.clan_id).eq('season', season);
  const hoursMap = new Map(); for (const row of hoursRows || []) hoursMap.set(String(row.member_id), (hoursMap.get(String(row.member_id)) || 0) + Number(row.total_hours || 0));
  const rows = snapshots.map((row) => {
    const baseline = baselineMap.get(String(row.member_id));
    const gain = baseline ? Number(row.reputation) - Number(baseline.baseline_rep) : 0;
    const today = dayMap.has(String(row.member_id)) ? Number(row.reputation) - dayMap.get(String(row.member_id)) : 0;
    const hours = hoursMap.get(String(row.member_id)) || 0;
    return { id: String(row.member_id), member: row.ign, level: row.level, rep: Number(row.reputation), baseline: baseline?.baseline_rep ?? null, gain, todayGain: today, hours, repPerHour: hours > 0 ? gain / hours : 0, source: row.source, capturedAt: row.captured_at, suspicious: row.suspicious, status: freshness(row.captured_at).status };
  }).sort((a, b) => b.rep - a.rep);
  const totalRep = rows.reduce((sum, row) => sum + row.rep, 0);
  const totalGain = rows.reduce((sum, row) => sum + row.gain, 0);
  const todayGain = rows.reduce((sum, row) => sum + row.todayGain, 0);
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const latest = snapshots.reduce((max, row) => Math.max(max, Date.parse(row.captured_at)), 0);
  const fresh = freshness(latest ? new Date(latest).toISOString() : null);
  const { count: suspiciousCount } = await db.from('rep_tracker_snapshots').select('*', { count: 'exact', head: true }).eq('clan_id', config.clan_id).eq('season', season).eq('suspicious', true);
  return { configured: true, config, season, rows, stats: { totalRep, totalGain, todayGain, activeMembers: rows.length, totalHours, avgRepPerHour: totalHours ? totalGain / totalHours : 0, suspiciousCount: suspiciousCount || 0 }, freshness: fresh };
}

export async function createBaseline(admin) {
  const data = await dashboardData();
  if (!data.configured) throw new Error('Clan and season are not configured. Sync live data first.');
  const db = supabaseAdmin();
  const { data: existing } = await db.from('rep_tracker_baselines').select('member_id').eq('clan_id', data.config.clan_id).eq('season', data.season);
  if (existing?.length) throw new Error(`Season baseline already exists for ${existing.length} members.`);
  const capturedAt = nowIso();
  const rows = data.rows.map((row) => ({ season: data.season, clan_id: data.config.clan_id, member_id: row.id, ign: row.member, level: row.level, baseline_rep: row.rep, captured_at: capturedAt }));
  const { error } = await db.from('rep_tracker_baselines').insert(rows);
  if (error) throw error;
  await db.from('rep_tracker_seasons').update({ baseline_created_at: capturedAt }).eq('season', data.season);
  await audit('Created season baseline', { season: data.season, memberCount: rows.length }, admin);
  return { season: data.season, count: rows.length, capturedAt };
}

export async function addHours(payload, admin) {
  const db = supabaseAdmin();
  const total = Number(payload.totalHours);
  if (!Number.isFinite(total) || total < 0) throw new Error('Total hours must be a non-negative number.');
  const row = {
    season: safeText(payload.season), clan_id: safeText(payload.clanId), member_id: safeText(payload.memberId), work_date: payload.workDate,
    start_time: payload.startTime || null, end_time: payload.endTime || null, break_minutes: Math.max(0, asInt(payload.breakMinutes)), total_hours: total,
    source: ['MANUAL','ADMIN','IMPORT'].includes(payload.source) ? payload.source : 'MANUAL', notes: safeText(payload.notes) || null,
  };
  if (!row.season || !row.clan_id || !row.member_id || !row.work_date) throw new Error('Season, clan, member, and date are required.');
  const { data, error } = await db.from('rep_tracker_hours').insert(row).select('*').single();
  if (error) throw error;
  await audit('Added hours session', { id: data.id, ...row }, admin);
  return data;
}

export async function memberDetail(memberId, hours = 168) {
  const data = await dashboardData();
  if (!data.configured) return null;
  const db = supabaseAdmin();
  const since = new Date(Date.now() - Math.min(720, Math.max(1, Number(hours) || 168)) * 3600 * 1000).toISOString();
  const { data: points, error } = await db.from('rep_tracker_snapshots').select('captured_at,reputation,level,ign,suspicious,suspicious_reason,source').eq('clan_id', data.config.clan_id).eq('season', data.season).eq('member_id', String(memberId)).gte('captured_at', since).order('captured_at', { ascending: true });
  if (error) throw error;
  const row = data.rows.find((item) => item.id === String(memberId));
  return { summary: row || null, points: points || [], season: data.season, config: data.config };
}

export async function startNewSeason(season, finalDayAt, admin) {
  const seasonName = safeText(season);
  if (!seasonName) throw new Error('Season name is required.');
  const config = await getConfig();
  if (!config?.clan_id) throw new Error('Discover the Chaos clan before starting a season.');
  const db = supabaseAdmin();
  const { data: locked } = await db.from('rep_tracker_finalizations').select('season').eq('season', seasonName).limit(1);
  if (locked?.length) throw new Error('That season already has a finalized result.');
  await ensureSeason({ ...config, current_season: seasonName }, seasonName, config.clan_id);
  await updateConfig({ current_season: seasonName, final_day_at: finalDayAt || null });
  await audit('Started new season', { season: seasonName, finalDayAt: finalDayAt || null }, admin);
  return getConfig();
}

export async function finalizeSeason(admin) {
  const config = await getConfig();
  if (!config?.clan_id || !config?.current_season) throw new Error('Clan/season not configured.');
  const live = await syncTracker({ force: true, admin });
  const fresh = await dashboardData();
  if (!fresh.configured || fresh.freshness.status === 'stale' || fresh.freshness.status === 'offline') throw new Error('Finalization blocked because live data is not fresh.');
  if (config.expected_member_count && fresh.rows.length < Number(config.expected_member_count)) throw new Error(`Finalization blocked: ${fresh.rows.length} members returned, ${config.expected_member_count} expected.`);
  const db = supabaseAdmin();
  const { data: versions } = await db.from('rep_tracker_finalizations').select('version').eq('season', fresh.season).order('version', { ascending: false }).limit(1);
  const version = Number(versions?.[0]?.version || 0) + 1;
  const lockedAt = nowIso();
  const raw = { stats: fresh.stats, rows: fresh.rows, config: fresh.config, live: { source: live.live?.source, service: live.live?.service, fetchedAt: live.live?.fetchedAt } };
  const { data, error } = await db.from('rep_tracker_finalizations').insert({ season: fresh.season, version, clan_id: config.clan_id, final_timestamp: lockedAt, server_timestamp: lockedAt, member_count: fresh.rows.length, total_rep: fresh.stats.totalRep, season_gain: fresh.stats.totalGain, total_hours: fresh.stats.totalHours, avg_rep_per_hour: fresh.stats.avgRepPerHour, locked_by: admin, raw_snapshot: raw }).select('*').single();
  if (error) throw error;
  await db.from('rep_tracker_seasons').update({ status: 'locked', final_locked_at: lockedAt }).eq('season', fresh.season);
  await audit('Final Day Lock', { season: fresh.season, version, memberCount: fresh.rows.length }, admin);
  return data;
}

export async function finalHistory() {
  const db = supabaseAdmin();
  const { data, error } = await db.from('rep_tracker_finalizations').select('*').order('season', { ascending: false }).order('version', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateFinalizationCorrection({ season, rows, admin, reason }) {
  const config = await getConfig();
  const existing = (await finalHistory()).filter((x) => x.season === season).sort((a,b)=>b.version-a.version)[0];
  if (!existing) throw new Error('No finalized result exists for that season.');
  const db = supabaseAdmin();
  const version = Number(existing.version) + 1;
  const raw = { ...existing.raw_snapshot, correctedRows: rows, correctionReason: reason };
  const totalRep = rows.reduce((s,r)=>s+Number(r.rep||r.finalRep||0),0);
  const totalGain = rows.reduce((s,r)=>s+Number(r.gain||r.repGain||0),0);
  const totalHours = rows.reduce((s,r)=>s+Number(r.hours||0),0);
  const timestamp = nowIso();
  const { data, error } = await db.from('rep_tracker_finalizations').insert({ season, version, clan_id: config.clan_id, final_timestamp: timestamp, server_timestamp: timestamp, member_count: rows.length, total_rep: totalRep, season_gain: totalGain, total_hours: totalHours, avg_rep_per_hour: totalHours ? totalGain / totalHours : 0, locked_by: admin, raw_snapshot: raw }).select('*').single();
  if (error) throw error;
  await audit('Final Day Unlock / correction', { season, newVersion: version, reason }, admin);
  return data;
}

export async function recentActivity(limit = 12) {
  const data = await dashboardData();
  if (!data.configured) return [];
  const db = supabaseAdmin();
  const ids = data.rows.map((r) => r.id);
  const { data: points } = await db.from('rep_tracker_snapshots').select('member_id,ign,reputation,captured_at').eq('clan_id', data.config.clan_id).eq('season', data.season).in('member_id', ids.length ? ids : ['_']).order('captured_at', { ascending: false }).limit(Math.max(100, limit * 8));
  const previous = new Map(); const events = [];
  for (const point of points || []) {
    const key = String(point.member_id); const prev = previous.get(key);
    if (prev && Number(point.reputation) > Number(prev.reputation)) events.push({ memberId: key, member: point.ign, gain: Number(point.reputation) - Number(prev.reputation), at: point.captured_at });
    previous.set(key, point);
    if (events.length >= limit) break;
  }
  return events;
}
