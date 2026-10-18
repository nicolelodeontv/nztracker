// Parse and persist finished Clan War Result tables only.
// It intentionally does not write the current ranking or reputation history.
const PAGE_URL = process.env.NZ_PUBLIC_URL || "https://ninjazenshin.online/?panel=clan-ranking";
const USER_AGENT = "nztracker (finished clan war reader)";

/* ---------- small HTML helpers for finished war tables ---------- */

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const textOf = (html) =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();

const toInt = (s) => {
  const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

function tableRows(tableHtml) {
  const rows = [];
  for (const tr of tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<t([dh])[^>]*>([\s\S]*?)<\/t\1>/gi)].map((c) => textOf(c[2]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function memberCount(value) {
  const raw = String(value ?? "");
  const fraction = raw.match(/(\d+)\s*\/\s*\d+/);
  return fraction ? Number(fraction[1]) : toInt(raw);
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(d, mon, y) {
  const m = MONTHS[mon.slice(0, 3).toLowerCase()];
  return m ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
}

/**
 * Parse finished-season result tables only. The season value is kept in the
 * canonical season text format (for example, "Season 3").
 * This parser deliberately does not parse or write the current ranking table.
 */
export function parseClanPage(html) {
  const result = { war: [] };
  let previousTableEnd = 0;

  for (const match of String(html ?? "").matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const start = match.index;
    const before = textOf(String(html).slice(previousTableEnd, start));
    previousTableEnd = start + match[0].length;

    const rows = tableRows(match[0]);
    if (rows.length < 2) continue;

    const headers = rows[0].map((header) => header.toLowerCase());
    const column = (name) => headers.findIndex((header) => header.includes(name));
    const clanIndex = column("clan");
    const masterIndex = column("master");
    const membersIndex = column("member");
    const reputationIndex = column("reputation");

    // Exclude current ranking tables; those have a Master column and are
    // Current ranking persistence is handled elsewhere.
    if (clanIndex < 0 || masterIndex >= 0 || membersIndex < 0 || reputationIndex < 0) continue;

    const seasonMatch = [...before.matchAll(/Season\s+(\d+)/gi)].pop();
    if (!seasonMatch) continue;
    const endedMatch = [...before.matchAll(/Ended\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/gi)].pop();
    const season = `Season ${seasonMatch[1]}`;

    const parsed = rows.slice(1)
      .map((row, index) => ({
        season,
        rank: toInt(row[0]) ?? index + 1,
        clan_name: row[clanIndex],
        members: memberCount(row[membersIndex]),
        reputation: toInt(row[reputationIndex]),
        ended_on: endedMatch ? isoDate(endedMatch[1], endedMatch[2], endedMatch[3]) : null
      }))
      .filter((row) => row.clan_name && row.reputation !== null && row.rank !== null);

    if (parsed.length) result.war.push(...parsed);
  }

  return result;
}

/* ---------- fetch ---------- */

export async function fetchClanPage(fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(PAGE_URL, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`ninjazenshin.online responded ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Supabase PostgREST for finished war results ---------- */

function sb(path, init = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be configured");
  }
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...init.headers
    }
  });
}

async function mustOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}

/* ---------- sync ---------- */

export async function syncClans() {
  const parsed = parseClanPage(await fetchClanPage());
  let warRows = 0;

  // A page with no completed war results is a valid no-op; ranking history
  // are left to the dedicated ranking monitor.
  if (parsed.war.length) {
    await mustOk(
      await sb("clan_war_results?on_conflict=season,rank", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(parsed.war)
      }),
      "clan_war_results upsert"
    );
    warRows = parsed.war.length;
  }

  return {
    seasons: [...new Set(parsed.war.map((row) => row.season))],
    war_rows: warRows
  };
}
