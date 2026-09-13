import * as cheerio from 'cheerio';

export const GAME_HOME_SOURCE = 'https://ninjazenshin.online/';
export const GAME_CLAN_SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const decode = (value) => clean(value)
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#039;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');
const numberValue = (value) => {
  const match = clean(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};
const attr = (el, names) => {
  for (const name of names) {
    const value = clean(el.attr(name));
    if (value) return decode(value);
  }
  return null;
};
const parseRound = (text) => {
  const match = clean(text).match(/Round\s*([0-9]+\s*\/\s*[0-9]+)/i);
  return match ? match[1].replace(/\s+/g, '') : '';
};
const parseSeason = (text) => {
  const match = clean(text).match(/Season\s*([0-9]+)/i);
  return match ? `Season ${match[1]}` : '';
};

function classifyTable(headers) {
  const text = headers.map((h) => clean(h).toLowerCase()).join(' | ');
  if (text.includes('win') && text.includes('lose')) return 'pvp';
  if (text.includes('score') && text.includes('character')) return 'pve';
  if (text.includes('clan') && text.includes('master') && text.includes('reputation')) return 'clan';
  return null;
}

function boardFromTable(table, headers, sectionText, fallbackSeason) {
  const type = classifyTable(headers);
  if (!type) return null;
  const rows = [];
  const $ = table.$;
  $(table.el).find('tbody tr, tr').each((_, tr) => {
    const cells = $(tr).find('th,td').map((__, cell) => decode($(cell).text())).get();
    if (cells.length < 3 || !/^\d+$/.test(cells[0])) return;
    const rank = numberValue(cells[0]);
    const playerName = cells[1] || '';

    if (type === 'clan') {
      const reputation = numberValue(cells[cells.length - 1]);
      const memberMatch = clean(cells[cells.length - 2]).replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
      const memberCurrent = memberMatch ? Number(memberMatch[1]) : numberValue(cells[cells.length - 2]);
      const memberMax = memberMatch ? Number(memberMatch[2]) : 0;
      rows.push({
        rank,
        clan: playerName,
        master: cells[2] || '',
        memberCurrent,
        memberMax,
        members: memberCurrent,
        reputation,
        clanId: attr($(tr), ['data-clan-id', 'data-clan', 'clan_id', 'clanid']) ||
          clean($(tr).find('a[href*="clan-ranking/members/"]').attr('href')).match(/clan-ranking\/members\/(\d+)/i)?.[1] || null,
        rawData: { cells }
      });
      return;
    }

    if (type === 'pvp') {
      // Current public PvP table is Rank | Character | Win/Lose | Winrate.
      // There is no separate visible ranking-points column, so preserve the
      // exact W/L + winrate fields instead of inventing a score.
      const wl = clean(cells[2] || '').replace(/~/g, '').match(/(\d+)\s*\/\s*(\d+)/);
      const winRate = numberValue(cells[3] || '');
      const wins = wl ? Number(wl[1]) : 0;
      const losses = wl ? Number(wl[2]) : 0;
      rows.push({
        rank,
        playerName,
        score: wins,
        wins,
        losses,
        winRate,
        title: attr($(tr), ['data-title', 'title', 'data-rank-title']),
        badge: attr($(tr), ['data-badge', 'data-badge-name', 'aria-label']),
        rawData: { cells }
      });
      return;
    }

    rows.push({
      rank,
      playerName,
      score: numberValue(cells[2]),
      wins: 0,
      losses: 0,
      winRate: 0,
      title: attr($(tr), ['data-title', 'title', 'data-rank-title']),
      badge: attr($(tr), ['data-badge', 'data-badge-name', 'aria-label']),
      rawData: { cells }
    });
  });

  return {
    type,
    season: parseSeason(sectionText) || fallbackSeason || null,
    round: parseRound(sectionText),
    rows
  };
}

export function parseGamePage(html) {
  const $ = cheerio.load(String(html ?? ''));
  const pageText = $.root().text();
  const pageSeason = parseSeason(pageText);
  const tables = [];
  let sectionText = '';

  $('h1,h2,h3,h4,p,small,div,table').each((_, el) => {
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'table') {
      const table = {
        el,
        $,
        headers: $(el).find('thead th, thead td').map((__, cell) => $(cell).text()).get(),
        sectionText
      };
      if (!table.headers.length) {
        table.headers = $(el).find('tr').first().find('th,td').map((__, cell) => $(cell).text()).get();
      }
      tables.push(table);
      sectionText = '';
      return;
    }
    if (/^h[1-4]$/i.test(tag)) sectionText = `${$(el).text()} `;
    else if (sectionText) sectionText += `${$(el).text()} `;
  });

  const parsed = tables
    .map((table) => boardFromTable(table, table.headers, table.sectionText, pageSeason))
    .filter(Boolean);
  const clanRanking = parsed.find((board) => board.type === 'clan');
  const pve = parsed.find((board) => board.type === 'pve');
  const pvp = parsed.find((board) => board.type === 'pvp');

  return {
    season: clanRanking?.season || pve?.season || pvp?.season || pageSeason || null,
    clanRanking: clanRanking?.rows || [],
    pve: { season: pve?.season || pageSeason || null, round: pve?.round || '', rows: pve?.rows || [] },
    pvp: { season: pvp?.season || pageSeason || null, round: pvp?.round || '', rows: pvp?.rows || [] },
    source: GAME_HOME_SOURCE
  };
}

export async function fetchGamePage() {
  const capturedAt = new Date().toISOString();
  const url = `${GAME_HOME_SOURCE}?_sync=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 NinjaZenshinTracker/5.0',
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });
  if (!response.ok) throw new Error(`Game home source returned HTTP ${response.status}`);
  const html = await response.text();
  const parsed = parseGamePage(html);
  if (!parsed.clanRanking.length && !parsed.pve.rows.length && !parsed.pvp.rows.length) {
    throw new Error('Game home source returned no ranking tables.');
  }
  return { ...parsed, capturedAt };
}
