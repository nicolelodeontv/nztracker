import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function toNumber(value) { return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0; }

async function collectRanking() {
  const response = await fetch(SOURCE, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.2',
      Accept: 'text/html,application/xhtml+xml'
    }
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
      const clanId = clean(clanCell.find('[data-clan]').attr('data-clan') || '');

      if (rank > 0 && clan) rows.push({ rank, clan, master, memberCurrent, memberMax, reputation, clanId: clanId || null });
    });
  });

  const bodyText = clean($('body').text());
  const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
  if (seasonMatch) season = `Season ${seasonMatch[1]}`;
  if (!rows.length) throw new Error('Clan ranking table not found');

  rows.sort((a, b) => a.rank - b.rank);
  return { season, rows, fetchedAt: new Date().toISOString(), source: SOURCE };
}

async function countMembers(clanId, requestUrl) {
  if (!clanId) return { count: 0, source: 'none' };

  const target = new URL('/api/clan-members', requestUrl);
  target.searchParams.set('clanId', clanId);
  target.searchParams.set('monitor', '1');

  const response = await fetch(target, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Member route returned HTTP ${response.status} for ${clanId}`);

  const payload = await response.json();
  return {
    count: Number(payload?.count || 0),
    source: payload?.staminaSource || payload?.service || 'unknown'
  };
}

export async function GET(request) {
  const startedAt = new Date();

  try {
    const ranking = await collectRanking();
    const withIds = ranking.rows.filter((clan) => clan.clanId);
    const results = await Promise.allSettled(withIds.map((clan) => countMembers(clan.clanId, request.url)));
    const membersSeen = results.reduce((sum, result) => sum + (result.status === 'fulfilled' ? result.value.count : 0), 0);
    const memberErrors = results.filter((result) => result.status === 'rejected').length;
    const sourceCounts = {};

    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const source = result.value.source || 'unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    return Response.json({
      ok: true,
      mode: 'live-no-database',
      season: ranking.season,
      clansSeen: ranking.rows.length,
      clansWithMemberData: withIds.length - memberErrors,
      membersSeen,
      memberErrors,
      memberSources: sourceCounts,
      fetchedAt: ranking.fetchedAt,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      source: ranking.source
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error) {
    return Response.json({
      ok: false,
      mode: 'live-no-database',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString()
    }, { status: 502 });
  }
}
