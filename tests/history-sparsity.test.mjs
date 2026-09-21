import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_HEARTBEAT_MS,
  buildCarryForwardSnapshots,
  selectHistoryWrites
} from '../app/lib/history-sparsity.mjs';

const fields = ['rank', 'reputation', 'member_current'];

function denseAndSparseMovement(rows) {
  const state = buildCarryForwardSnapshots(rows, (row) => String(row.clan_id));
  const result = {};
  for (const [clanId, current] of state.current) {
    const previous = state.previous.get(clanId);
    if (!previous) continue;
    result[clanId] = {
      rankDelta: Number(previous.rank) - Number(current.rank),
      reputationDelta: Number(current.reputation) - Number(previous.reputation),
      fromRank: Number(previous.rank),
      toRank: Number(current.rank)
    };
  }
  return result;
}

test('unchanged values write nothing', () => {
  const records = [{
    clan_id: '3', season: 'Season 3', rank: 1, reputation: 100, member_current: 29,
    snapshot_at: '2026-09-21T02:30:00.000Z'
  }];
  const previous = new Map([['3', {
    clan_id: '3', rank: 1, reputation: 100, member_current: 29,
    snapshot_at: '2026-09-21T02:25:00.000Z'
  }]]);

  const result = selectHistoryWrites(records, previous, {
    keyOf: (row) => row.clan_id,
    snapshotAt: records[0].snapshot_at,
    trackedFields: fields
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.unchangedCount, 1);
});

test('changed values write one row', () => {
  const records = [{
    clan_id: '3', season: 'Season 3', rank: 2, reputation: 105, member_current: 29,
    snapshot_at: '2026-09-21T02:30:00.000Z'
  }];
  const previous = new Map([['3', {
    clan_id: '3', rank: 1, reputation: 100, member_current: 29,
    snapshot_at: '2026-09-21T02:25:00.000Z'
  }]]);

  const result = selectHistoryWrites(records, previous, {
    keyOf: (row) => row.clan_id,
    snapshotAt: records[0].snapshot_at,
    trackedFields: fields
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.changedCount, 1);
});

test('hourly heartbeat writes unchanged values', () => {
  const snapshotAt = '2026-09-21T03:30:00.000Z';
  const previous = new Map([['3', {
    clan_id: '3', rank: 1, reputation: 100, member_current: 29,
    snapshot_at: new Date(Date.parse(snapshotAt) - HISTORY_HEARTBEAT_MS).toISOString()
  }]]);
  const result = selectHistoryWrites([{
    clan_id: '3', season: 'Season 3', rank: 1, reputation: 100, member_current: 29,
    snapshot_at: snapshotAt
  }], previous, {
    keyOf: (row) => row.clan_id,
    snapshotAt,
    trackedFields: fields
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.heartbeatCount, 1);
});

test('dense and sparse clan history produce the same movement result', () => {
  const t0 = '2026-09-21T01:00:00.000Z';
  const t1 = '2026-09-21T01:05:00.000Z';
  const dense = [
    { clan_id: '3', rank: 1, reputation: 100, member_current: 29, snapshot_at: t0 },
    { clan_id: '7', rank: 2, reputation: 90, member_current: 20, snapshot_at: t0 },
    { clan_id: '3', rank: 2, reputation: 105, member_current: 29, snapshot_at: t1 },
    { clan_id: '7', rank: 2, reputation: 90, member_current: 20, snapshot_at: t1 }
  ];
  const sparse = [
    dense[0],
    dense[1],
    dense[2]
  ];

  assert.deepEqual(denseAndSparseMovement(dense), denseAndSparseMovement(sparse));
});

test('sparse leaderboard history uses the same latest state model as dense history', () => {
  const t0 = '2026-09-21T01:00:00.000Z';
  const t1 = '2026-09-21T01:05:00.000Z';
  const dense = [
    { board_type: 'pvp', season: 'Season 3', round: '1', player_name: 'Alpha', rank: 1, score: 100, wins: 5, losses: 1, snapshot_at: t0 },
    { board_type: 'pvp', season: 'Season 3', round: '1', player_name: 'Beta', rank: 2, score: 90, wins: 4, losses: 2, snapshot_at: t0 },
    { board_type: 'pvp', season: 'Season 3', round: '1', player_name: 'Alpha', rank: 2, score: 105, wins: 6, losses: 1, snapshot_at: t1 },
    { board_type: 'pvp', season: 'Season 3', round: '1', player_name: 'Beta', rank: 2, score: 90, wins: 4, losses: 2, snapshot_at: t1 }
  ];
  const sparse = [dense[0], dense[1], dense[2]];
  const projection = (rows) => {
    const state = buildCarryForwardSnapshots(rows, (row) => row.player_name);
    return [...state.current].map(([name, current]) => {
      const previous = state.previous.get(name);
      return [name, previous ? current.score - previous.score : null, current.rank];
    });
  };
  assert.deepEqual(projection(dense), projection(sparse));
});
