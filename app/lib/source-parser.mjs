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
  return {
    days,
    hours,
    minutes,
    seconds,
    remainingSeconds: days * 86400 + hours * 3600 + minutes * 60 + seconds
  };
}

function looksLikeRankingTable($, table) {
  const headers = $(table).find('thead th').map((_, element) => clean($(element).text()).toLowerCase()).get();
  const rankIndex = findHeaderIndex(headers, 'rank', '#', 'ranking');
  const clanIndex = findHeaderIndex(headers, 'clan');
  const masterIndex = findHeaderIndex(headers, 'master', 'clan master', 'leader');
  const membersIndex = findHeaderIndex(headers, 'members', 'member');
  const reputationIndex = findHeaderIndex(headers, 'reputation', 'rep');
  return {
    headers,
    rankIndex,
    clanIndex,
    masterIndex,
    membersIndex,
    reputationIndex,
    valid: [rankIndex, clanIndex, membersIndex, reputationIndex].every((index) => index >= 0)
  };
}

export function parseRankingHtml(html) {
  const $ = cheerio.load(String(html ?? ''));
  const candidates = [];

  $('table').each((_, table) => {
    const definition = looksLikeRankingTable($, table);
    if (!definition.valid) return;

    const tableRows = [];
    $(table).find('tbody tr').each((__, row) => {
      const cells = $(row).find('td').map((___, cell) => clean($(cell).text())).get();
      if (!cells.length) return;

      const clan = clean(cells[definition.clanIndex]);
      if (!clan) return;

      const memberCount = parseMemberCount(cells[definition.membersIndex]);
      const master = definition.masterIndex >= 0 ? clean(cells[definition.masterIndex]) : '';
      const rank = toNumber(cells[definition.rankIndex]);
      const reputation = toNumber(cells[definition.reputationIndex]);
      const clanId = findClanId($, row);

      if (rank <= 0) return;

      // The source page currently contains a secondary table using the same
      // headers but empty member/master fields. Ignore those rows entirely.
      const isRealClanRow = Boolean(clanId) || Boolean(master) || memberCount.current > 0 || memberCount.max > 0;
      if (!isRealClanRow) return;

      tableRows.push({
        rank,
        clan,
        master,
        memberCurrent: memberCount.current,
        memberMax: memberCount.max,
        reputation,
        clanId
      });
    });

    if (tableRows.length) candidates.push(tableRows);
  });

  if (!candidates.length) throw new Error('Clan ranking table not found in source HTML');

  // Prefer the table carrying actual clan metadata and the largest number of
  // valid clan rows. This avoids accidentally merging an alternate/summary
  // table that repeats the ranking with incomplete values.
  candidates.sort((a, b) => b.length - a.length);
  const rows = candidates[0].slice().sort((a, b) => a.rank - b.rank);

  // Final guard against duplicate rows from responsive/desktop copies.
  const seenIds = new Set();
  const seenNames = new Set();
  const uniqueRows = rows.filter((row) => {
    const nameKey = row.clan.toLocaleLowerCase().normalize('NFC');
    const idKey = row.clanId ? String(row.clanId) : null;
    if (idKey && seenIds.has(idKey)) return false;
    if (!idKey && seenNames.has(nameKey)) return false;
    if (idKey) seenIds.add(idKey);
    seenNames.add(nameKey);
    return true;
  });

  if (!uniqueRows.length) throw new Error('Clan ranking table contained no usable rows');

  const bodyText = clean($('body').text());
  const seasonMatch = bodyText.match(/Clan Ranking\s+Season\s+(\d+)/i);
  const season = seasonMatch ? `Season ${seasonMatch[1]}` : 'Season 2';

  return {
    rows: uniqueRows,
    season,
    countdown: parseCountdown($)
  };
}
