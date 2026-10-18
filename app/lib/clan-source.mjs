// Public clan ranking and war-result sync source.
// Reads the PUBLIC Clan Ranking + Clan War Result tables from ninjazenshin.online
// (no login, no AMF) and stores snapshots in Supabase.
import { createHash } from "node:crypto";

const PAGE_URL = process.env.NZ_PUBLIC_URL || "https://ninjazenshin.online/";
const USER_AGENT = "nztracker (clan stats reader, 1 request per run)";
const MIN_RANKING_ROWS = 5; // guard: fewer rows means the page changed or is client-rendered

/* ---------- tiny HTML helpers (no dependencies) ---------- */

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
  )
    .replace(/\s+/g, " ")
    .trim();

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

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function isoDate(d, mon, y) {
  const m = MONTHS[mon.slice(0, 3).toLowerCase()];
  return m ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
}

/* ---------- parser ---------- */

/**
 * Finds tables by their header cells, not by position, so small layout changes don't break it.
 *  - ranking table:  headers include Clan, Master, Members, Reputation
 *  - war result:     headers include Clan, Members, Reputation (no Master); season + end date
 *                    come from the text just before the table ("Season 3 — Top 10 / Ended 19 Oct 2026")
 */
export function parseClanPage(html) {
  const result = { ranking: null, war: [] };
  let prevEnd = 0;

  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    const start = m.index;
    const before = textOf(html.slice(prevEnd, start));
    prevEnd = start + m[0].length;

    const rows = tableRows(m[0]);
    if (rows.length < 2) continue;
    const head = rows[0].map((h) => h.toLowerCase());
    const col = (name) => head.findIndex((h) => h.includes(name));
    const iClan = col("clan"), iMaster = col("master"), iMembers = col("member"), iRep = col("reputation");
    if (iClan < 0 || iRep < 0 || iMembers < 0) continue;

    const body = rows.slice(1);

    if (iMaster >= 0) {
      // Clan Ranking
      const parsed = body
        .map((r, i) => {
          const mem = String(r[iMembers] ?? "").match(/(\d+)\s*\/\s*(\d+)/);
          return {
            rank: toInt(r[0]) ?? i + 1,
            clan_name: r[iClan],
            master: r[iMaster] || null,
            members: mem ? +mem[1] : toInt(r[iMembers]),
            member_cap: mem ? +mem[2] : null,
            reputation: toInt(r[iRep]),
          };
        })
        .filter((r) => r.clan_name && r.reputation !== null);
      if (!result.ranking) {
        result.ranking = { closed: /season closed/i.test(before.slice(-300)), rows: parsed };
      }
    } else {
      // Clan War Result (one table per finished season)
      const season = [...before.matchAll(/Season\s+(\d+)/gi)].pop();
      const ended = [...before.matchAll(/Ended\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/gi)].pop();
      if (!season) continue;
      const parsed = body
        .map((r, i) => ({
          season: +season[1],
          rank: toInt(r[0]) ?? i + 1,
          clan_name: r[iClan],
          members: toInt(r[iMembers]),
          reputation: toInt(r[iRep]),
          ended_on: ended ? isoDate(ended[1], ended[2], ended[3]) : null,
        }))
        .filter((r) => r.clan_name && r.reputation !== null);
      if (parsed.length) result.war.push(...parsed);
    }
  }
  return result;
}

export function hashRanking(rows, closed) {
  const canon = rows.map((r) => `${r.rank}|${r.clan_name}|${r.master ?? ""}|${r.members}|${r.reputation}`).join("\n");
  return createHash("sha256").update(`${closed}\n${canon}`).digest("hex");
}

/* ---------- fetch ---------- */

export async function fetchClanPage(fetchImpl = fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetchImpl(PAGE_URL, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ninjazenshin.online responded ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Supabase (PostgREST, service role) ---------- */

function sb(path, init = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be configured");
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...init.headers },
  });
}

async function mustOk(res, label) {
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}

/* ---------- sync ---------- */

export async function syncClans() {
  const parsed = parseClanPage(await fetchClanPage());

  if (!parsed.ranking || parsed.ranking.rows.length < MIN_RANKING_ROWS) {
    throw new Error(
      `Clan ranking table not found or too small (${parsed.ranking?.rows.length ?? 0} rows). ` +
        "The page is probably rendered client-side now - find the JSON endpoint in the Network tab."
    );
  }

  const { rows, closed } = parsed.ranking;

  // 1) ranking snapshot - skipped inside SQL when nothing changed since the last one
  const snap = await mustOk(
    await sb("rpc/insert_clan_snapshot", {
      method: "POST",
      body: JSON.stringify({ p_hash: hashRanking(rows, closed), p_closed: closed, p_rows: rows }),
    }),
    "insert_clan_snapshot"
  ).then((r) => r.json());

  // 2) finished-season results (upsert; old seasons never change)
  let warRows = 0;
  if (parsed.war.length) {
    await mustOk(
      await sb("clan_war_results?on_conflict=season,rank", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(parsed.war),
      }),
      "clan_war_results upsert"
    );
    warRows = parsed.war.length;
  }

  return { snapshot: snap, ranking_rows: rows.length, season_closed: closed, war_rows: warRows };
}
