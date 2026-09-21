import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_SAMPLE_MS,
  buildMemberHistoryResponse,
  shouldAddMemberPoint
} from '../app/lib/member-history.js';

test('records the first point', () => {
  assert.equal(shouldAddMemberPoint(null, 1000), true);
});

test('records when reputation changes before five minutes', () => {
  assert.equal(shouldAddMemberPoint({ last_point_at: new Date(1000).toISOString(), rep: 100 }, 2000, 101), true);
});

test('records after five minutes even when reputation is unchanged', () => {
  assert.equal(
    shouldAddMemberPoint({ last_point_at: new Date(1000).toISOString(), rep: 100 }, 1000 + HISTORY_SAMPLE_MS, 100),
    true
  );
});

test('does not record unchanged reputation before five minutes', () => {
  assert.equal(
    shouldAddMemberPoint({ last_point_at: new Date(1000).toISOString(), rep: 100 }, 1000 + HISTORY_SAMPLE_MS - 1, 100),
    false
  );
});

test('member history response preserves the API shape', () => {
  const response = buildMemberHistoryResponse({
    clanId: '3',
    season: 'Season 2',
    version: 3,
    startedAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T01:00:00.000Z',
    stored: true,
    members: {
      '42': {
        name: 'Test',
        level: 100,
        points: [{ t: 1000, r: 500, level: 100, name: 'Test' }],
        lastSeenAt: '2026-09-21T01:00:00.000Z'
      }
    }
  });

  assert.deepEqual(Object.keys(response).sort(), ['clanId', 'members', 'season', 'startedAt', 'stored', 'updatedAt', 'version']);
  assert.deepEqual(response.members['42'].points[0], { t: 1000, r: 500, level: 100, name: 'Test' });
});
