import { requireAdmin } from '../../lib/admin-auth.js';
import { getConfig } from '../../lib/rep-tracker.js';
import { readSyncHealth } from '../../lib/sync-health.mjs';

const AMF = process.env.GAME_AMF_ORIGIN || 'https://amf.ninjazenshin.online/';
const SOURCE = process.env.GAME_SOURCE_ORIGIN || 'https://ninjazenshin.online';
const LEGACY_MEMBER = `${SOURCE}/clan-ranking/members/`;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  try {
    const [config, health] = await Promise.all([
      getConfig(),
      readSyncHealth().catch(() => null)
    ]);
    const diagnostics = health?.sourceDiagnostics || {};
    return Response.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      config: config ? {
        clanId: config.clan_id || null,
        clanName: config.clan_name || null,
        season: config.current_season || null
      } : null,
      source: {
        amf,
        legacyMember: LEGACY_MEMBER,
        active: health?.lastMemberSource || null,
        health: health?.lastSourceHealth || 'unknown',
        warning: health?.lastSourceWarning || null,
        diagnostics
      },
      sync: {
        lastRunAt: health?.lastRunAt || null,
        lastMemberSuccessAt: health?.lastMemberSuccessAt || null,
        lastHealthyAt: health?.lastHealthyAt || null,
        consecutiveFailures: Number(health?.consecutiveFailures || 0),
        consecutiveSourceWarnings: Number(health?.consecutiveSourceWarnings || 0)
      }
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  }
}
