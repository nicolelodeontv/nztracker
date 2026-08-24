import * as cheerio from 'cheerio';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const toNumber = (value) => {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
};

function findHeaderIndex(headers, ...names) {
  return headers.findIndex((header) => names.includes(header));
}

function parseMemberCount(value) {
  const match = String(value ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return { current: 0, max: 0 };
  return { current: toNumber(match[1]), max: toNumber(match[2]) };
}

function findClanId($, row) {
  const direct = $(row).find('[data-clan]').first().attr('data-clan');
  if (direct) return clean(direct);
  const links = $(row).find('a').map((_, element) => $(element).attr('href') || '').get();
  for (const href of links) {
    const query = href.match(/[?&](?:clanId|clan|id)=([A-Za-z0-9_-]+)/i);
    if (query) return clean(query[1]);
    const path = href.match(/\/clan(?:-ranking)?\/([^/?#]+)/i);
    if (path) return clean(path[1]);
  }
  return null;
}

function parseCountdown($) {
  const root = $('.clr-cd').first();
  if (!root.length) return null;
  const days = toNumber(root.find('[data-d]').first().text());
  const hours = toNumber(root.find('[data-h]').first().text());
  const minutes = toNumber(root.find('[data-m]').first().text());
  const seconds = toNumber(root.find('[data-s]').first().text());
  const values = [days, hours, minutes, seconds];
  if (!values.every(Number.isFinite)) return null;
  return {
    days,
    hours,
    minutes,
    seconds,
    remainingSeconds: days * 86400 + hours * 3600 + minutes * 60 + seconds
  };
}

export function parseRankingHtml(html) {
  const $ = cheerio.load(String(html ?? ''));
  const rows = [];

  $('table').each((_, table) => {
    const headers = $(table).find('thead th').map((__, element) => clean($(element).text()).toLowerCase()).get();
    const rankIndex = findHeaderIndex(headers, 'rank', '#', 'ranking');
    const clanIndex = findHeaderIndex(headers, 'clan');
    const masterIndex = findHeaderIndex(headers, 'master', 'clan master', 'leader');
    const membersIndex = findHeaderIndex(headers, 'members', 'member');
    const reputationIndex = findHeaderIndex(headers, 'reputation', 'rep');

    if ([rankIndex, clanIndex, membersIndex, reputationIndex].some((index) => index < 0)) return;

    $(table).find('tbody tr').each((__, row) => {
      const cells = $(row).find('td').map((___, cell) => clean($(cell).text())).get();
      if (!cells.length) return;

      const clan = clean(cells[clanIndex]);
      if (!clan) return;

      const memberCount = parseMemberCount(cells[membersIndex]);
      const rank = toNumber(cells[rankIndex]);
      if (rank <= 0) return;

      rows.push({
        rank,
        clan,
        master: masterIndex >= 0 ? clean(cells[masterIndex]) : '',
        memberCurrent: memberCount.current,
        memberMax: memberCount.max,
        reputation: toNumber(cells[reputationIndex]),
        clanId: findClanId($, row)
      });
    });
  });

  rows.sort((a, b) => a.rank - b.rank);
  if (!rows.length) throw new Error('Clan ranking table not found in source HTML');

  const bodyText = clean($('body').text());
  const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
  const season = seasonMatch ? `Season ${seasonMatch[1]}` : 'Season 2';

  return {
    rows,
    season,
    countdown: parseCountdown($)
  };
}
