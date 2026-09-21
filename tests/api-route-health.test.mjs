import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const root = new URL('../', import.meta.url);
const f = (p) => new URL(p, root).href;
const secret = 'x'.repeat(32);
const members = Array.from({length: 30}, (_, i) => ({ id: String(i + 1), name: `M${i + 1}`, level: 90, reputation: 1000 + i }));
const ranking = { rows: [{ clanId: '3', clan: 'Chaos', memberCurrent: 30 }], season: 'Season 3', capturedAt: new Date(Date.now() - 60_000).toISOString(), source: 'test' };
const config = { clan_id: '3', clan_name: 'Chaos', current_season: 'Season 3', expected_member_count: 30 };

mock.module(f('app/lib/rep-tracker.js'), { exports: {
  dashboardData: async () => ({ configured: true, config, season: 'Season 3', rows: [], stats: {}, freshness: { status: 'live', ageSeconds: 5 }, lastSuccessfulSyncAt: ranking.capturedAt }),
  recentActivity: async () => [],
  freshness: () => ({ status: 'live', ageSeconds: 5 }),
  getConfig: async () => config
}});

mock.module(f('app/lib/member-history.js'), { exports: {
  readSyncStatus: async () => ({ lastRunAt: ranking.capturedAt, membersSeen: 30, memberErrors: 0, overall: 'success' }),
  recordMemberSnapshot: async () => ({ stored: true, storedPoints: 30, changed: true }),
  recordSyncStatus: async () => ({ stored: true }),
  storageHealth: () => ({ provider: 'supabase', configured: true, authenticated: true, durable: true })
}});
mock.module(f('app/lib/ranking-cache.js'), { exports: { recordRankingSnapshot: async () => ({ stored: true }) }});
mock.module(f('app/lib/ninja-source.mjs'), { exports: { fetchLiveMembers: async () => ({ members, fetchedAt: ranking.capturedAt, service: 'test', source: 'test' }) }});
mock.module(f('app/lib/member-snapshot.mjs'), { exports: { buildTrackedClanTargets: () => ranking.rows, parseTrackedClanIds: () => ['3'] }});
mock.module(f('app/lib/member-recording.mjs'), { exports: { summarizeMemberRecording: () => ({ issues: [], error: null }) }});
mock.module(f('lib/scraper.mjs'), { exports: {
  scrapeGame: async () => ({ ...ranking, clanRanking: ranking.rows, pve: { rows: [1], season: 'Season 3', round: '1/1' }, pvp: { rows: [1], season: 'Season 3', round: '1/1' }}),
  scrapeClans: async () => ranking
}});
mock.module(f('lib/supabase-db.mjs'), { exports: {
  upsertClans: async () => ({ stored: true, count: 1 }),
  recordSyncRun: async () => ({ stored: true }),
  getLatestSync: async () => ({ status: 'success', completed_at: ranking.capturedAt, clans_count: 1, members_count: 30 }),
  dbStatus: () => ({ configured: true, provider: 'supabase' })
}});
mock.module(f('lib/multisource-db.mjs'), { exports: {
  recordClanHistory: async () => ({ stored: true }),
  upsertLeaderboardRows: async () => ({ stored: true }),
  upsertMemberRoster: async () => ({ stored: true }),
  upsertRepTrackerSnapshots: async () => ({ stored: true })
}});
mock.module(f('app/lib/monitor-status.mjs'), { exports: { getMonitorStatus: () => 'success' }});
mock.module(f('app/lib/source-parser.mjs'), { exports: { parseRankingHtml: () => ranking }});

const [{ GET: dashboardGET }, { GET: syncStatusGET }, { GET: syncAllGET }, { GET: monitorGET }] =
  await Promise.all([
    import('../app/api/dashboard/route.js'),
    import('../app/api/sync-status/route.js'),
    import('../app/api/sync-all/route.js'),
    import('../app/api/monitor/route.js')
  ]);

const request = (path, token) => new Request(`https://example.test${path}`, token ? { headers: { authorization: `Bearer ${token}` } } : undefined);
const body = (r) => r.json();

test('dashboard handler returns its real JSON shape', async () => {
  const r = await dashboardGET();
  const b = await body(r);
  assert.equal(r.status, 200);
  assert.equal(b.ok, true);
  assert.equal(b.configured, true);
  assert.equal(b.freshness.status, 'live');
});

test('sync-status handler returns its real JSON shape', async () => {
  const r = await syncStatusGET();
  const b = await body(r);
  assert.equal(r.status, 200);
  assert.equal(b.status, 'active');
  assert.equal(b.overall, 'success');
  assert.equal(b.membersSeen, 30);
});

test('sync-all rejects missing and wrong headers', async () => {
  process.env.CRON_SECRET = secret;
  assert.equal((await syncAllGET(request('/api/sync-all'))).status, 401);
  assert.equal((await syncAllGET(request('/api/sync-all', 'wrong'))).status, 401);
});

test('sync-all executes with the correct header and when the secret is unset', async () => {
  process.env.CRON_SECRET = secret;
  const ok = await syncAllGET(request('/api/sync-all', secret));
  assert.equal(ok.status, 200);
  assert.equal((await body(ok)).membersSeen, 30);

  delete process.env.CRON_SECRET;
  const open = await syncAllGET(request('/api/sync-all'));
  assert.equal(open.status, 200);
});

test('monitor rejects missing and wrong headers', async () => {
  process.env.CRON_SECRET = secret;
  assert.equal((await monitorGET(request('/api/monitor'))).status, 401);
  assert.equal((await monitorGET(request('/api/monitor', 'wrong'))).status, 401);
});

test('monitor executes with the correct header and rejects when the secret is unset', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).startsWith('https://ninjazenshin.online/')
    ? { ok: true, text: async () => '<html>test</html>' }
    : { ok: true, json: async () => ({ count: 30, members, service: 'test', stale: false }) };
  try {
    process.env.CRON_SECRET = secret;
    const ok = await monitorGET(request('/api/monitor', secret));
    assert.equal(ok.status, 200);
    assert.equal((await body(ok)).membersSeen, 30);

    delete process.env.CRON_SECRET;
    const denied = await monitorGET(request('/api/monitor'));
    assert.equal(denied.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.CRON_SECRET;
  }
});