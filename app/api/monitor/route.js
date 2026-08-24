import * as cheerio from 'cheerio';
import { ensureSchema } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOURCE = 'https://ninjazenshin.online/clan-ranking';

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function toNumber(value) { return Number(String(value || '').replace(/[^0-9.-]/g, '')) || 0; }

async function collectRanking() {
  const response = await fetch(SOURCE, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.0',
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

      const clanCell = $(tr).find('td').eq(1);
      const rank = toNumber(cells[0]);
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

async function collectMembers(clanId) {
  const target = `https://ninjazenshin.online/clan-ranking/members/${encodeURIComponent(clanId)}`;
  const response = await fetch(target, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.0',
      Accept: 'application/json,text/plain,*/*'
    }
  });
  if (!response.ok) throw new Error(`Member API returned ${response.status} for ${clanId}`);

  const payload = await response.json();
  return Array.isArray(payload?.members) ? payload.members : [];
}

export async function GET(request) {
  const startedAt = new Date();
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');

  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await ensureSchema();
    const ranking = await collectRanking();
    let memberCount = 0;

    await db`
      INSERT INTO clan_snapshots (season, fetched_at, source, rows)
      VALUES (${ranking.season}, ${ranking.fetchedAt}, ${ranking.source}, ${JSON.stringify(ranking.rows)})
    `;

    for (const clan of ranking.rows) {
      if (!clan.clanId) continue;
      try {
        const members = await collectMembers(clan.clanId);
        memberCount += members.length;
        await db`
          INSERT INTO member_snapshots (clan_id, clan_name, season, fetched_at, members)
          VALUES (${clan.clanId}, ${clan.clan}, ${ranking.season}, ${ranking.fetchedAt}, ${JSON.stringify(members)})
        `;
      } catch (memberError) {
        console.error(`Member collection failed for ${clan.clanId}:`, memberError);
      }
    }

    const finishedAt = new Date();
    await db`
      INSERT INTO monitor_runs (started_at, finished_at, status, clans_seen, members_seen)
      VALUES (${startedAt.toISOString()}, ${finishedAt.toISOString()}, 'success', ${ranking.rows.length}, ${memberCount})
    `;

    return Response.json({ ok: true, season: ranking.season, clansSeen: ranking.rows.length, membersSeen: memberCount, fetchedAt: ranking.fetchedAt });
  } catch (error) {
    try {
      const db = await ensureSchema();
      await db`
        INSERT INTO monitor_runs (started_at, finished_at, status, clans_seen, members_seen, error)
        VALUES (${startedAt.toISOString()}, ${new Date().toISOString()}, 'error', 0, 0, ${error instanceof Error ? error.message : String(error)})
      `;
    } catch (logError) {
      console.error('Unable to record monitor failure:', logError);
    }

    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
