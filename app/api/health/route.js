import { storageHealth, verifyStorageConnection } from '../../lib/member-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = storageHealth();
  const storage = await verifyStorageConnection();
  return Response.json({
    ok: true,
    service: 'nztracker',
    version: '2.0',
    generatedAt: new Date().toISOString(),
    services: {
      clanRanking: { status: 'ready', endpoint: '/api/clan-ranking' },
      clanMembers: { status: 'ready', endpoint: '/api/clan-members', fallback: 'legacy → AMF → last-known' },
      memberHistory: {
        status: storage.durable ? 'ready' : configured.configured ? 'connection-error' : 'needs-storage-connection',
        durable: storage.durable,
        configured: storage.configured,
        authenticated: storage.authenticated,
        provider: storage.provider,
        error: storage.durable ? null : storage.error || null,
      },
    },
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
