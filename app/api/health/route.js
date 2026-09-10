import { storageHealth } from '../../lib/member-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const storage = storageHealth();
  return Response.json({
    ok: true,
    service: 'nztracker',
    version: '2.0',
    generatedAt: new Date().toISOString(),
    services: {
      clanRanking: { status: 'ready', endpoint: '/api/clan-ranking' },
      clanMembers: { status: 'ready', endpoint: '/api/clan-members', fallback: 'legacy → AMF → last-known' },
      memberHistory: { status: storage.configured ? 'ready' : 'needs-storage-connection', durable: storage.durable, provider: storage.provider },
    },
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
