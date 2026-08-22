import * as cheerio from 'cheerio';

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const ORIGIN = 'https://ninjazenshin.online';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  try {
    const u = new URL(value, ORIGIN);
    if (u.origin !== ORIGIN) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export const revalidate = 30;

export async function GET() {
  try {
    const response = await fetch(SOURCE, {
      next: { revalidate: 30 },
      headers: {
        'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) return Response.json({ error: `Source returned ${response.status}` }, { status: 502 });

    const html = await response.text();
    const $ = cheerio.load(html);
    const scripts = $('script[src]').map((_, el) => normalize($(el).attr('src'))).get();
    const stylesheetScripts = $('script').map((_, el) => clean($(el).html())).get().filter(Boolean);
    const clanText = 'Sakura Zensen';
    const index = html.indexOf(clanText);
    const snippet = index >= 0 ? html.slice(Math.max(0, index - 1500), Math.min(html.length, index + 2500)) : null;

    const scriptMatches = [];
    for (const scriptUrl of scripts.slice(0, 30)) {
      try {
        const r = await fetch(scriptUrl, { next: { revalidate: 300 }, headers: { 'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/1.0' } });
        if (!r.ok) continue;
        const text = await r.text();
        const matches = text.match(/[^\"'`]{0,180}(?:clan|member|reputation)[^\"'`]{0,220}/gi) || [];
        if (matches.length) scriptMatches.push({ url: scriptUrl, matches: unique(matches).slice(0, 20) });
      } catch {}
    }

    return Response.json({
      source: SOURCE,
      scriptUrls: unique(scripts),
      inlineScriptCount: stylesheetScripts.length,
      clanSnippet: snippet,
      scriptMatches,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
