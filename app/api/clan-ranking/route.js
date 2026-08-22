import * as cheerio from 'cheerio';

export const revalidate = 30;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0;
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
      return Response.json(
        { error: `Source returned ${response.status}` },
        { status: 502 }
      );
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

        if (rank > 0 && clan) {
          rows.push({ rank, clan, master, memberCurrent, memberMax, reputation });
        }
      });
    });

    const bodyText = clean($('body').text());
    const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
    if (seasonMatch) season = `Season ${seasonMatch[1]}`;

    if (!rows.length) {
      return Response.json(
        { error: 'Clan ranking table not found' },
        { status: 502 }
      );
    }

    rows.sort((a, b) => a.rank - b.rank);

    return Response.json({
      season,
      rows,
      fetchedAt: new Date().toISOString(),
      source: SOURCE
    });
  } catch (error) {
    return Response.json(
      {
        error: 'Unable to fetch Ninja Zenshin',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
