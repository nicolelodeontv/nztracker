import { getClans } from '../../../lib/supabase-db.mjs';
import { getLeaderboards } from '../../../lib/multisource-db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export async function GET(request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'clans';
  const season = url.searchParams.get('season') || undefined;
  const format = url.searchParams.get('format') || 'csv';
  try {
    let rows = [];
    if (type === 'pve' || type === 'pvp') rows = await getLeaderboards({ type, season, limit: 500 }) || [];
    else rows = await getClans({ season, limit: 500 }) || [];

    if (format === 'json') {
      return Response.json({ ok: true, type, season, exportedAt: new Date().toISOString(), rows }, { headers: { 'Content-Disposition': `attachment; filename="nztracker-${type}.json"` } });
    }

    const headers = type === 'clans'
      ? ['rank','clan','master','members','max_members','reputation','season','captured_at']
      : ['rank','player','score','wins','losses','title','badge','season','round','captured_at'];
    const body = rows.map((row) => type === 'clans'
      ? [row.rank,row.clan,row.master,row.memberCurrent,row.memberMax,row.reputation,row.season,row.capturedAt]
      : [row.rank,row.playerName,row.score,row.wins,row.losses,row.title,row.badge,row.season,row.round,row.capturedAt]
    ).map((line) => line.map(esc).join(',')).join('\n');
    return new Response(`${headers.join(',')}\n${body}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="nztracker-${type}.csv"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
