const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const numberValue = (value) => {
  const match = clean(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const parseMembers = (value) => {
  const text = clean(value).replace(/,/g, '');
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) return { memberCurrent: Number(match[1]), memberMax: Number(match[2]) };
  const current = numberValue(text);
  return { memberCurrent: current, memberMax: 0 };
};

const decodeBasicEntities = (value) => clean(value)
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#039;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');

const normalizeClanId = (value) => {
  const id = clean(value);
  if (/^\d+$/.test(id)) return id;
  return null;
};

const parseClanId = (html) => {
  const matches = [
    ...html.matchAll(/(?:data-clan-id|data-clan|clan_id|clanid)=["']([^"']+)["']/gi),
  ];
  for (const match of matches) {
    const id = normalizeClanId(match[1]);
    if (id) return id;
  }

  const linkMatches = [...html.matchAll(/clan-ranking\/members\/([^"'?#\s]+)/gi)];
  for (const match of linkMatches) {
    const id = normalizeClanId(match[1]);
    if (id) return id;
  }

  return null;
};

export function parseRankingHtml(html) {
  const text = String(html ?? '');
  const rows = [];
  const tableMatches = text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const match of tableMatches) {
    const rowHtml = match[1];
    const cells = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => decodeBasicEntities(cell[1].replace(/<[^>]+>/g, ' ')));
    if (cells.length < 5) continue;

    const joined = cells.join(' ').toLowerCase();
    if (joined.includes('rank') && joined.includes('clan') && joined.includes('reputation')) continue;

    const rank = numberValue(cells[0]);
    if (!rank || !cells[1]) continue;

    const reputation = numberValue(cells[cells.length - 1]);
    const memberData = parseMembers(cells[cells.length - 2]);
    const master = cells.length >= 5 ? cells[2] : '';
    const clan = cells.length >= 5 ? cells[1] : '';
    const parsedId = parseClanId(rowHtml);
    const fallbackId = `name:${clan.normalize('NFC').toLocaleLowerCase()}`;

    rows.push({
      rank,
      clan,
      master,
      members: memberData.memberCurrent,
      memberCurrent: memberData.memberCurrent,
      memberMax: memberData.memberMax,
      reputation,
      clanId: parsedId || fallbackId
    });
  }

  // Deduplicate by the real game clan ID. For legacy rows without an ID,
  // fall back to a normalized clan name so the same clan cannot appear twice.
  const unique = new Map();
  for (const row of rows) {
    const key = row.clanId || `name:${row.clan.normalize('NFC').toLocaleLowerCase()}`;
    const previous = unique.get(key);
    if (!previous || row.rank < previous.rank) unique.set(key, row);
  }

  const seasonMatch = text.match(/Season\s*([0-9]+)/i);
  const countdownMatch = text.match(/(?:countdown|remaining|ends?)[^0-9]{0,40}(\d+\s*d\s*\d+\s*h\s*\d+\s*m)/i);

  return {
    rows: [...unique.values()],
    season: seasonMatch ? `Season ${seasonMatch[1]}` : null,
    countdown: countdownMatch?.[1] || null
  };
}
