import * as cheerio from 'cheerio';
import { recordMemberSnapshot, recordSyncStatus, storageHealth } from '../../lib/member-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const INTERVAL_MS = 5 * 60 * 1000;

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function toNumber(value) { return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0; }

async function collectRanking() {
  const response = await fetch(SOURCE, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/3.0', Accept: 'text/html,application/xhtml+xml' }
  });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  const rows = [];
  let season = 'Season 2';

  $('table').each((_, table) => {
    const headers = $(table).find('thead th').map((__, el) => clean($(el).text()).toLowerCase()).get();
    if (!headers.includes('clan') || !headers.includes('reputation') || !headers.includes('members')) return;
    $(table).find('tbody tr').each((__, tr) => {
      const cells = $(tr).find('td').map((___, td) => clean($(td).text())).get();
      if (cells.length < 5) return;
      const rank = toNumber(cells[0]);
      const clanCell = $(tr).find('td').eq(1);
      const clan = clean(clanCell.text());
      const master = cells[2];
      const [memberCurrent, memberMax] = (cells[3] || '0/0').split('/').map(toNumber);
      const reputation = toNumber(cells[4]);
      const clanId = clean(
        clanCell.find('[data-clan]').attr('data-clan') ||
        clanCell.find('a[href*="clanId"]').attr('data-clan') ||
        clanCell.find('a').attr('data-clan') || ''
      );
      if (rank > 0 && clan) rows.push({ rank, clan, master, memberCurrent, memberMax, reputation, clanId: clanId || null });
    });
  });

  const bodyText = clean($('body').text());
  const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
  if (seasonMatch) season = `Season ${seasonMatch[1]}`;
  if (!rows.length) throw new Error('Clan ranking table not found');

  const deduped = [...new Map(rows.map((row) => [`${row.rank}:${row.clan}:${row.clanId || ''}`, row])).values()];
  deduped.sort((a, b) => a.rank - b.rank);
  return { season, rows: deduped, fetchedAt: new Date().toISOString(), source: SOURCE };
}

async function fetchMembers(clanId, requestUrl) {
  if (!clanId) return { count: 0, source: 'none', members: [], stale: false };
  const target = new URL('/api/clan-members', requestUrl);
  target.searchParams.set('clanId', clanId);
  target.searchParams.set('monitor', '1');
  const response = await fetch(target, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Member route returned HTTP ${response.status} for ${clanId}`);
  const payload = await response.json();
  const members = Array.isArray(payload?.members) ? payload.members : [];
  const seen = new Set();
  const uniqueMembers = members.filter((member, index) => {
    const key = String(member?.id || member?.name || index);
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(String(member?.name || '').trim());
  });
  return {
    count: uniqueMembers.length,
    source: payload?.stale ? 'last-known' : payload?.staminaSource || payload?.service || 'live',
    members: uniqueMembers,
    stale: Boolean(payload?.stale),
  };
}

async function monitorClan(clan, season, requestUrl) {
  try {
    const data = await fetchMembers(clan.clanId, requestUrl);
    if (!clan.clanId || data.stale || !data.members.length) {
      return { ...data, clanId: clan.clanId, clan: clan.clan, failed: false, history: { stored: false, changed: false, reason: data.stale ? 'Last-known member data; snapshot not advanced.' : 'No live members returned.' } };
    }
    const history = await recordMemberSnapshot({ clanId: clan.clanId, season, members: data.members, capturedAt: Date.now() });
    return { ...data, clanId: clan.clanId, clan: clan.clan, failed: false, history };
  } catch (error) {
    return { clanId: clan.clanId, clan: clan.clan, count: 0, members: [], source: 'error', stale: false, failed: true, error: error instanceof Error ? error.message : String(error), history: { stored: false, changed: false } };
  }
}

async function safelyRecordStatus(payload) {
  try { return await recordSyncStatus(payload); } catch { return { stored: false }; }
}

export async function GET(request) {
  const startedAt = new Date();
  try {
    const ranking = await collectRanking();
    const withIds = ranking.rows.filter((clan) => clan.clanId);
    const results = await Promise.all(withIds.map((clan) => monitorClan(clan, ranking.season, request.url)));
    const membersSeen = results.reduce((sum, result) => sum + Number(result.count || 0), 0);
    const memberErrors = results.filter((result) => result.failed).length;
    const historyStored = results.filter((result) => result.history?.stored).length;
    const historyChanged = results.filter((result) => result.history?.changed).length;
    const sourceCounts = {};
    results.forEach((result) => {
      const source = result.source || 'unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    const finishedAt = new Date();
    const sync = await safelyRecordStatus({
      ok: memberErrors === 0,
      status: memberErrors > 0 ? 'degraded' : 'active',
      season: ranking.season,
      lastRunAt: finishedAt.toISOString(),
      nextExpectedAt: new Date(finishedAt.getTime() + INTERVAL_MS).toISOString(),
      clansSeen: ranking.rows.length,
      clansWithMemberData: results.filter((result) => !result.failed && result.count > 0 && !result.stale).length,
      membersSeen,
      memberErrors,
      historyClansStored: historyStored,
      historyClansChanged: historyChanged,
      sampleIntervalMs: INTERVAL_MS,
      memberSources: sourceCounts,
      source: ranking.source,
      storageDurable: storageHealth().durable,
    });

    return Response.json({
      ok: true,
      mode: 'live-with-history',
      season: ranking.season,
      clansSeen: ranking.rows.length,
      clansWithMemberData: results.filter((result) => !result.failed && result.count > 0 && !result.stale).length,
      membersSeen,
      memberErrors,
      memberSources: sourceCounts,
      history: { clansStored: historyStored, clansChanged: historyChanged, sampleIntervalMs: INTERVAL_MS },
      historyStorage: storageHealth(),
      syncStatusStored: Boolean(sync.stored),
      fetchedAt: ranking.fetchedAt,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      source: ranking.source,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const finishedAt = new Date();
    await safelyRecordStatus({ ok: false, status: 'error', lastRunAt: finishedAt.toISOString(), nextExpectedAt: new Date(finishedAt.getTime() + INTERVAL_MS).toISOString(), source: SOURCE, storageDurable: storageHealth().durable, error: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, mode: 'live-with-history', historyStorage: storageHealth(), error: error instanceof Error ? error.message : String(error), finishedAt: finishedAt.toISOString() }, { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
