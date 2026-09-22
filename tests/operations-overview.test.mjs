import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatGlobalMove,
  memberDisplayName,
  selectNeedsAttention,
  selectTopBurn
} from '../app/lib/operations-overview.mjs';

test('memberDisplayName resolves the member field used by live rows and falls back safely', () => {
  assert.equal(memberDisplayName({ member: 'LiveName', name: 'HistoryName' }), 'LiveName');
  assert.equal(memberDisplayName({ name: 'HistoryName' }), 'HistoryName');
  assert.equal(memberDisplayName({ member: '', name: 'HistoryName' }), 'HistoryName');
  assert.equal(memberDisplayName({ ign: 'IgnName' }), 'IgnName');
  assert.equal(memberDisplayName({ id: 'member-1' }), 'member-1');
  assert.equal(memberDisplayName({}), 'Unknown member');
});

test('selectTopBurn returns only positive gains, deduplicates members, and keeps ties stable', () => {
  const rows = [
    { id: 'a', member: 'Alpha', gain: 0, gainPerHour: 0 },
    { id: 'b', member: 'Bravo', gain: 380, gainPerHour: 62.729 },
    { id: 'c', member: 'Charlie', gain: 500, gainPerHour: 40 },
    { id: 'd', member: 'Delta', gain: 100, gainPerHour: 100 },
    { id: 'b', member: 'Bravo', gain: 380, gainPerHour: 62.729 },
    { id: 'e', member: 'Echo', gain: 250, gainPerHour: 50 },
    { id: 'f', member: 'Foxtrot', gain: 0, gainPerHour: 0 }
  ];

  const top = selectTopBurn(rows, 5);

  assert.deepEqual(top.map((row) => row.id), ['c', 'b', 'e', 'd']);
  assert.ok(top.every((row) => Number(row.gain) > 0));
  assert.equal(new Set(top.map((row) => row.id)).size, top.length);
});

test('selectTopBurn shows fewer than five rows when fewer than five members have gains', () => {
  const top = selectTopBurn([
    { id: 'a', member: 'Alpha', gain: 25 },
    { id: 'b', member: 'Bravo', gain: 0 },
    { id: 'c', member: 'Charlie', gain: 10 }
  ], 5);

  assert.deepEqual(top.map((row) => row.member), ['Alpha', 'Charlie']);
});

test('selectNeedsAttention preserves filtered rows, correct names, and deterministic ordering', () => {
  const rows = [
    { id: 'a', name: 'Alpha', status: 'IDLE', gain: 100, gainPerHour: 50 },
    { id: 'b', member: 'Bravo', status: 'ACTIVE', gain: 0, gainPerHour: 0 },
    { id: 'c', name: 'Charlie', status: 'NO GAIN', gain: 0, gainPerHour: 0 },
    { id: 'd', ign: 'Delta', status: 'RESET', gain: 25, gainPerHour: 10 },
    { id: 'e', name: 'Echo', status: 'MISSING', gain: 0, gainPerHour: 0 }
  ];

  const attention = selectNeedsAttention(rows, 6);

  assert.deepEqual(attention.map((row) => memberDisplayName(row)), ['Charlie', 'Echo', 'Delta', 'Alpha']);
  assert.deepEqual(attention.map((row) => row.status), ['NO GAIN', 'MISSING', 'RESET', 'IDLE']);
});

test('rep pace selectors remain valid for every supported time window', () => {
  const periods = [1, 3, 6, 12, 24, 168];
  for (const hours of periods) {
    const rows = [
      { id: '1', member: 'Active', gain: hours * 10, gainPerHour: 10, status: 'ACTIVE' },
      { id: '2', member: 'Idle', gain: 0, gainPerHour: 0, status: 'IDLE' }
    ];
    assert.equal(selectTopBurn(rows, 5).length, 1, 'Top Burn should only show gainers for ' + hours + 'H');
    assert.equal(selectNeedsAttention(rows, 6).length, 1, 'Needs Attention should still filter for ' + hours + 'H');
  }
});

test('formatGlobalMove distinguishes untracked history from genuine no movement', () => {
  assert.equal(formatGlobalMove(null, false), 'NOT YET TRACKED');
  assert.equal(formatGlobalMove(null, true), '—');
  assert.equal(formatGlobalMove({ rankDelta: 2 }, true), '↑2');
  assert.equal(formatGlobalMove({ rankDelta: -3 }, true), '↓3');
  assert.equal(formatGlobalMove({ rankDelta: 0 }, true), '—');
});
