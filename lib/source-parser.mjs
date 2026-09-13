const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const numberValue = (value) => {
  const match = clean(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

export function parseRankingHtml(html) {
  const text = String(html ?? '');
  const rows = [];
  const tableMatches = text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const match of tableMatches) {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => clean(cell[1].replace(/<[^>]+>/g, ' ')));
    if (cells.length < 5) continue;

    const joined = cells.join(' ').toLowerCase();
    if (joined.includes('rank') && joined.includes('clan') && joined.includes('reputation')) continue;

    const rank = numberValue(cells[0]);
    if (!rank || !cells[1]) continue;

    const reputation = numberValue(cells[cells.length - 1]);
    const members = numberValue(cells[cells.length - 2]);
    const master = cells.length >= 5 ? cells[2] : '';
    const clan = cells.length >= 5 ? cells[1] : '';
    const idMatch = match[1].match(/(?:data-clan-id|clan_id|clanid)=["']([^"']+)["']/i);

    rows.push({
      rank,
      clan,
      master,
      members,
      reputation,
      clanId: idMatch?.[1] || clan.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    });
  }

  const unique = new Map();
  for (const row of rows) unique.set(row.clanId || row.clan, row);

  const seasonMatch = text.match(/Season\s*([0-9]+)/i);
  const countdownMatch = text.match(/(?:countdown|remaining|ends?)[^0-9]{0,40}(\d+\s*d\s*\d+\s*h\s*\d+\s*m)/i);

  return {
    rows: [...unique.values()],
    season: seasonMatch ? `Season ${seasonMatch[1]}` : null,
    countdown: countdownMatch?.[1] || null
  };
}
