import { parseRankingHtml } from '../../lib/source-parser.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

const SOURCE = 'https://ninjazenshin.online/?panel=clan-ranking';
const FALLBACK_SEASON_END = '2026-09-14T00:00:00+08:00';
const SOURCE_TIMEOUT_MS = 12000;

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);

  try {
    const response = await fetch(SOURCE, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NinjaZenshinLiveTracker/2.3',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);

    const html = await response.text();
    const parsed = parseRankingHtml(html);

    return Response.json({
      ok: true,
      season: parsed.season,
      seasonEndsAt: FALLBACK_SEASON_END,
      countdown: parsed.countdown,
      rows: parsed.rows,
      fetchedAt: new Date().toISOString(),
      source: SOURCE,
      sourceStatus: 'connected'
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `Source request timed out after ${SOURCE_TIMEOUT_MS / 1000}s`
      : error instanceof Error ? error.message : String(error);

    console.error('Clan ranking source failure', message);
    return Response.json({
      ok: false,
      error: 'Unable to fetch Ninja Zenshin clan ranking',
      details: message,
      source: SOURCE,
      sourceStatus: 'offline',
      fetchedAt: new Date().toISOString()
    }, {
      status: 502,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}
