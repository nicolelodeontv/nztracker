import test from 'node:test';
import assert from 'node:assert/strict';

const envKeys = ['BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_OIDC_TOKEN', 'VERCEL'];

async function withoutBlobConfig(task) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  try {
    await task();
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('Blob-backed status writes are non-fatal when storage is unavailable', async () => {
  await withoutBlobConfig(async () => {
    const { recordSyncStatus, storageHealth } = await import('../app/lib/member-history.js');
    assert.equal(storageHealth().durable, false);
    const result = await recordSyncStatus({ status: 'active' });
    assert.equal(result.stored, false);
    assert.match(result.reason || '', /Blob storage is not connected/i);
  });
});

test('Blob-backed member history reads return usable last-known shape without storage', async () => {
  await withoutBlobConfig(async () => {
    const { readMemberHistory } = await import('../app/lib/member-history.js');
    const result = await readMemberHistory({ clanId: '3', season: 'Season 3', hours: 24 });
    assert.equal(result.stored, false);
    assert.deepEqual(result.members, {});
    assert.equal(result.clanId, '3');
    assert.equal(result.season, 'Season_3');
  });
});

test('Ranking cache writes are non-fatal when Blob is not configured', async () => {
  await withoutBlobConfig(async () => {
    const { recordRankingSnapshot } = await import('../app/lib/ranking-cache.js');
    const result = await recordRankingSnapshot({ season: 'Season 3', rows: [] });
    assert.equal(result.stored, false);
    assert.match(result.reason || '', /Blob storage is not connected/i);
  });
});
