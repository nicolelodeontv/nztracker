import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';
const SOURCE_TIMEOUT_MS = 12000;

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function toNumber(value) { return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0; }
function findClanId($, row, clanCell) {
  const direct = clanCell.find('[data-clan]').attr('data-clan') || $(row).find('[data-clan]').first().attr('data-clan');
  if (direct) return clean(direct);
  const links = $(row).find('a').map((_, el) => $(el).attr('href') || '').get();
  for (const href of links) {
    const match = href.match(/[?&](?:clanId|clan|id)=([A-Za-z0-9_-]+)/i);
    if (match) return clean(match[1]);
    const pathMatch = href.match(/\/clan(?:-ranking)?\/([^/?#]+)/i);
    if (pathMatch) return clean(pathMatch[1]);
  }
  return null;
}

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(SOURCE, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.2',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const rows = [];
    let season = 'Season 2';

    const days = toNumber($('.clr-cd [data-d]').first().text());
    const hours = toNumber($('.clr-cd [data-h]').first().text());
    const minutes = toNumber($('.clr-cd [data-m]').first().text());
    const seconds = toNumber($('.clr-cd [data-s]').first().text());
    const hasCountdown = $('.clr-cd').length > 0 && $('.clr-cd [data-d]').length > 0 && $('.clr-cd [data-h]').length > 0;
    const remainingSeconds = hasCountdown ? days * 86400 + hours * 3600 + minutes * 60 + seconds : null;

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
        const clanId = findClanId($, tr, clanCell);

        if (rank > 0 && clan) rows.push({ rank, clan, master, memberCurrent, memberMax, reputation, clanId });
      });
    });

    const bodyText = clean($('body').text());
    const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
    if (seasonMatch) season = `Season ${seasonMatch[1]}`;
    if (!rows.length) throw new Error('Clan ranking table not found in source HTML');

    rows.sort((a, b) => a.rank - b.rank);

    return Response.json({
      ok: true,
      season,
      seasonEndsAt: FALLBACK_SEASON_END,
      countdown: hasCountdown ? { days, hours, minutes, seconds, remainingSeconds } : null,
      rows,
      fetchedAt: new Date().toISOString(),
      source: SOURCE,
      sourceStatus: 'connected'
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error?.name === 'AbortError' ? `Source request timed out after ${SOURCE_TIMEOUT_MS / 1000}s` : error instanceof Error ? error.message : String(error);
    console.error('Clan ranking source failure', message);
    return Response.json({
      ok: false,
      error: 'Unable to fetch Ninja Zenshin clan ranking',
      details: message,
      source: SOURCE,
      sourceStatus: 'offline',
      fetchedAt: new Date().toISOString()
    }, { status: 502, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } finally {
    clearTimeout(timer);
  }
}
