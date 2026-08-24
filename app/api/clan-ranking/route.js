import * as cheerio from 'cheerio';
import { ensureSchema } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

const SOURCE = 'https://ninjazenshin.online/clan-ranking';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function toNumber(value) { return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0; }

async function fromDatabase() {
  const db = await ensureSchema();
  const result = await db`
    SELECT season, fetched_at, source, rows
    FROM clan_snapshots
    ORDER BY fetched_at DESC
    LIMIT 1
  `;
  if (!result.length) return null;
  const snapshot = result[0];
  return {
    season: snapshot.season,
    seasonEndsAt: FALLBACK_SEASON_END,
    countdown: null,
    rows: snapshot.rows,
    fetchedAt: new Date(snapshot.fetched_at).toISOString(),
    source: snapshot.source,
    stored: true
  };
}

async function fromSource() {
  const response = await fetch(SOURCE, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.0', Accept: 'text/html,application/xhtml+xml' }
  });
  if (!response.ok) throw new Error(`Source returned ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const rows = [];
  let season = 'Season 2';

  const days = toNumber($('.clr-cd [data-d]').first().text());
  const hours = toNumber($('.clr-cd [data-h]').first().text());
  const minutes = toNumber($('.clr-cd [data-m]').first().text());
  const seconds = toNumber($('.clr-cd [data-s]').first().text());
  const hasCountdown = $('.clr-cd').length && $('.clr-cd [data-d]').length && $('.clr-cd [data-h]').length;
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
      const clanId = clean(clanCell.find('[data-clan]').attr('data-clan') || '');
      if (rank > 0 && clan) rows.push({ rank, clan, master, memberCurrent, memberMax, reputation, clanId: clanId || null });
    });
  });

  const bodyText = clean($('body').text());
  const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
  if (seasonMatch) season = `Season ${seasonMatch[1]}`;
  if (!rows.length) throw new Error('Clan ranking table not found');
  rows.sort((a, b) => a.rank - b.rank);

  return {
    season,
    seasonEndsAt: FALLBACK_SEASON_END,
    countdown: hasCountdown ? { days, hours, minutes, seconds, remainingSeconds } : null,
    rows,
    fetchedAt: new Date().toISOString(),
    source: SOURCE,
    stored: false
  };
}

export async function GET() {
  try {
    try {
      const stored = await fromDatabase();
      if (stored) return Response.json(stored);
    } catch (databaseError) {
      console.warn('Database unavailable; falling back to live source:', databaseError);
    }

    return Response.json(await fromSource());
  } catch (error) {
    return Response.json({ error: 'Unable to fetch Ninja Zenshin', details: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
