import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/donations/route.js';
import { computeDonationDelta, validateDonationPayload } from '../app/lib/donation-history.js';

process.env.INGEST_KEY = 'test-ingest-key';

function request(body, headers = {}) {
  return new Request('https://chaoszenshintracker.vercel.app/api/donations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST omitting the ingest header returns 401', async () => {
  const response = await POST(request({
    clanId: '3', season: 'Season 3',
    members: [{ id: '1', name: 'Alpha', donated_gold: 100, donated_token: 2 }],
  }));
  assert.equal(response.status, 401);
});

test('POST returns 503 when INGEST_KEY env var is unset and does not echo the key', async () => {
  const originalKey = process.env.INGEST_KEY;
  delete process.env.INGEST_KEY;
  try {
    const response = await POST(request(
      { clanId: '3', season: 'Season 3', members: [{ id: '1', name: 'Alpha', donated_gold: 100, donated_token: 2 }] },
      { 'X-Ingest-Key': 'test-ingest-key' },
    ));
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text.includes('test-ingest-key'), false);
    assert.equal(text.includes('secret-ingest-key'), false);
  } finally {
    process.env.INGEST_KEY = originalKey;
  }
});

test('POST rejects a wrong ingest key with 401 and never echoes it', async () => {
  const response = await POST(request(
    { clanId: '3', season: 'Season 3', members: [{ id: '1', name: 'Alpha', donated_gold: 100, donated_token: 2 }] },
    { 'X-Ingest-Key': 'wrong-key' },
  ));
  assert.equal(response.status, 401);
  const text = await response.text();
  assert.equal(text.includes('wrong-key'), false);
  assert.equal(text.includes('test-ingest-key'), false);
});

test('POST rejects empty snapshots with 422', async () => {
  const response = await POST(request(
    { clanId: '3', season: 'Season 3', members: [] },
    { 'X-Ingest-Key': process.env.INGEST_KEY },
  ));
  assert.equal(response.status, 422);
});

test('POST rejects malformed donation members with 422', async () => {
  const response = await POST(request(
    { clanId: '3', season: 'Season 3', members: [{ id: '1', name: 'Alpha', donated_gold: 'not-a-number', donated_token: 2 }] },
    { 'X-Ingest-Key': process.env.INGEST_KEY },
  ));
  assert.equal(response.status, 422);
});

test('POST accepts a valid snapshot without requiring Blob in unit tests', async () => {
  delete process.env.BLOB_STORE_ID;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.VERCEL;
  const response = await POST(request(
    {
      clanId: '3', season: 'Season 3',
      members: [
        { id: '1', name: 'Alpha', level: 90, donated_gold: 1000, donated_token: 8 },
        { id: '2', name: 'Beta', level: 88, donated_gold: 500, donated_token: 2 },
      ],
    },
    { 'X-Ingest-Key': process.env.INGEST_KEY },
  ));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.memberCount, 2);
});

test('donation delta computation preserves resource changes, including resets', () => {
  assert.deepEqual(
    computeDonationDelta({ donated_gold: 1500, donated_token: 12 }, { donated_gold: 1000, donated_token: 7 }),
    { gold: 500, token: 5 },
  );
  assert.deepEqual(
    computeDonationDelta({ donated_gold: 200, donated_token: 1 }, { donated_gold: 1000, donated_token: 7 }),
    { gold: -800, token: -6 },
  );
});

test('donation payload validation cleans identity fields and rejects duplicate identities', () => {
  const valid = validateDonationPayload({
    clanId: ' 3 ',
    season: 'Season 3',
    members: [{ memberId: 'A1', name: '  Alpha  ', donated_gold: '1,200', donated_token: '3' }],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.clanId, '3');
  assert.equal(valid.members[0].id, 'A1');
  assert.equal(valid.members[0].name, 'Alpha');
  assert.equal(valid.members[0].donated_gold, 1200);

  const duplicate = validateDonationPayload({
    clanId: '3', season: 'Season 3',
    members: [
      { id: 'A1', name: 'Alpha', donated_gold: 1, donated_token: 1 },
      { id: 'A1', name: 'Other', donated_gold: 2, donated_token: 2 },
    ],
  });
  assert.equal(duplicate.ok, false);
});
