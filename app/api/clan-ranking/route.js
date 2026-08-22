import * as cheerio from 'cheerio';

export const revalidate = 30;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const SITE_ORIGIN = 'https://ninjazenshin.online';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractUrlFromElement($, element) {
  const el = $(element);
  const direct = [
    el.attr('href'),
    el.attr('data-href'),
    el.attr('data-url'),
    el.attr('data-link'),
    el.attr('data-clan-url'),
    el.attr('data-target')
  ].find(Boolean);

  if (direct) return normalizeUrl(direct);

  const onclick = el.attr('onclick') || '';
  const quoted = onclick.match(/['\"]((?:https?:\/\/|\/|\?)[^'\"]+)['\"]/i);
  if (quoted) return normalizeUrl(quoted[1]);

  const urlLike = onclick.match(/((?:https?:\/\/|\/|\?)[^\s'\")]+clan[^\s'\")]+)/i);
  if (urlLike) return normalizeUrl(urlLike[1]);

  return null;
}

export async function GET() {
  try {
    const response = await fetch(SOURCE, {
      next: { revalidate: 30 },
      headers: {
        'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0',
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      return Response.json({ error: `Source returned ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const rows = [];
    let season = 'Season 2';

    $('table').each((_, table) => {
      const headers = $(table)
        .find('thead th')
        .map((__, el) => clean($(el).text()).toLowerCase())
        .get();

      if (!headers.includes('clan') || !headers.includes('reputation') || !headers.includes('members')) {
        return;
      }

      $(table).find('tbody tr').each((__, tr) => {
        const cells = $(tr).find('td').map((___, td) => clean($(td).text())).get();
        if (cells.length < 5) return;

        const rank = toNumber(cells[0]);
        const clan = cells[1];
        const master = cells[2];
        const [memberCurrent, memberMax] = (cells[3] || '0/0').split('/').map(toNumber);
        const reputation = toNumber(cells[4]);

        const clanCell = $(tr).find('td').eq(1);
        const detailUrl = extractUrlFromElement($, clanCell) || extractUrlFromElement($, clanCell.find('a,button,[data-href],[data-url],[onclick]').first());
        const memberLookupUrl = detailUrl || `${SITE_ORIGIN}/?panel=clan-ranking&clan_name=${encodeURIComponent(clan)}`;

        if (rank > 0 && clan) {
          rows.push({ rank, clan, master, memberCurrent, memberMax, reputation, detailUrl: memberLookupUrl });
        }
      });
    });

    const bodyText = clean($('body').text());
    const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
    if (seasonMatch) season = `Season ${seasonMatch[1]}`;

    if (!rows.length) {
      return Response.json({ error: 'Clan ranking table not found' }, { status: 502 });
    }

    rows.sort((a, b) => a.rank - b.rank);

    return Response.json({
      season,
      rows,
      fetchedAt: new Date().toISOString(),
      source: SOURCE
    });
  } catch (error) {
    return Response.json({
      error: 'Unable to fetch Ninja Zenshin',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}
