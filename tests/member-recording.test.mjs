import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMembers } from '../app/lib/ninja-source.mjs';
import { buildRepTrackerSnapshotRows } from '../lib/multisource-db.mjs';
import { summarizeMemberRecording } from '../app/lib/member-recording.mjs';
import { buildTrackedClanTargets, parseTrackedClanIds, selectChangedSnapshotRows, selectRetentionIds } from '../app/lib/member-snapshot.mjs';

test('ID-free members use normalized names and never member_number', () => {
  const members = normalizeMembers([
    { name: ' CHAOS   Alpha ', level: 92, rep: 6543, member_number: 29 },
    { name: 'CHAOS Beta', level: 90, rep: 1173, member_number: 30 }
  ]);

  assert.deepEqual(members.map((member) => member.id), ['chaos alpha', 'chaos beta']);
  assert.deepEqual(members.map((member) => member.identitySource), ['name', 'name']);
  assert.ok(members.every((member) => !Object.prototype.hasOwnProperty.call(member, 'member_number')));

  const snapshot = buildRepTrackerSnapshotRows({
    season: 'Season 3',
    snapshotAt: '2026-09-21T02:15:00.000Z',
    clanResults: [{ clanId: '3', service: 'legacy-live', members }]
  });

  assert.equal(snapshot.rows.length, 2);
  assert.deepEqual(snapshot.rows.map((row) => row.member_id), ['chaos alpha', 'chaos beta']);
  assert.ok(snapshot.rows.every((row) => row.member_id !== '29' && row.member_id !== '30'));
});

test('stable source IDs are preserved and missing IDs are not replaced by member_number', () => {
  const members = normalizeMembers([
    { id: 6252, name: 'Stable', level: 90, rep: 100, member_number: 29 },
    { name: 'Missing', level: 89, rep: 90, member_number: 30 }
  ]);

  assert.equal(members.length, 1);
  assert.equal(members[0].id, '6252');
  assert.equal(members[0].identitySource, 'id');
});

test('ambiguous duplicate names are flagged and excluded from snapshot gain calculations', () => {
  const members = normalizeMembers([
    { name: 'Same Name', level: 90, rep: 100 },
    { name: ' same   name ', level: 91, rep: 200 },
    { name: 'Unique Name', level: 88, rep: 300 }
  ]);

  assert.equal(members.length, 3);
  assert.equal(members.filter((member) => member.identityAmbiguous).length, 2);
  assert.equal(members.find((member) => member.identityKey === 'unique name')?.identityAmbiguous, false);

  const snapshot = buildRepTrackerSnapshotRows({
    season: 'Season 3',
    snapshotAt: '2026-09-21T02:15:00.000Z',
    clanResults: [{ clanId: '3', service: 'legacy-live', members }]
  });

  assert.deepEqual(snapshot.rows.map((row) => row.member_id), ['unique name']);
  assert.equal(snapshot.ambiguousNames.length, 2);
});

test('zero recorded members for an occupied clan produces a warning', () => {
  const result = summarizeMemberRecording(
    [{ clanId: '3', clan: 'Chaos', memberCurrent: 29 }],
    [{ clanId: '3', expectedMemberCount: 29, recordableCount: 0, members: [], error: '0 members recorded' }]
  );

  assert.equal(result.status, 'warning');
  assert.match(result.error, /Chaos \(3\): 0 members recorded/);
  assert.equal(result.issues.length, 1);
});

test('recorded members prevent a false zero-member warning', () => {
  const result = summarizeMemberRecording(
    [{ clanId: '3', clan: 'Chaos', memberCurrent: 29 }],
    [{ clanId: '3', expectedMemberCount: 29, recordableCount: 28, members: [{ id: 'a' }], error: null }]
  );

  assert.equal(result.status, 'success');
  assert.equal(result.error, null);
  assert.equal(result.issues.length, 0);
});

test('only configured tracked clan IDs become member fetch targets', () => {
  assert.deepEqual(parseTrackedClanIds('3, 7,3'), ['3', '7']);
  assert.deepEqual(parseTrackedClanIds('', ['3']), ['3']);

  const targets = buildTrackedClanTargets([
    { clanId: '3', clan: 'Chaos', memberCurrent: 29 },
    { clanId: '7', clan: 'Other', memberCurrent: 20 },
    { clanId: '9', clan: 'Untracked', memberCurrent: 10 }
  ], ['3', '7']);

  assert.deepEqual(targets.map((clan) => clan.clanId), ['3', '7']);
});

test('unchanged members produce no new snapshot rows', () => {
  const result = selectChangedSnapshotRows({
    nowMs: Date.parse('2026-09-21T03:00:00.000Z'),
    candidates: [{
      clan_id: '3', season: 'Season 3', member_id: 'chaos alpha', ign: 'CHAOS Alpha',
      level: 92, reputation: 6543, stamina: 120, max_stamina: 200,
      source: 'legacy-live', captured_at: '2026-09-21T03:00:00.000Z'
    }],
    previousByKey: new Map([[
      '3:chaos alpha',
      { clan_id: '3', member_id: 'chaos alpha', level: 92, reputation: 6543, stamina: 120, max_stamina: 200, captured_at: '2026-09-21T02:30:00.000Z' }
    ]])
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.unchangedCount, 1);
});

test('changed members produce a new snapshot row', () => {
  const result = selectChangedSnapshotRows({
    nowMs: Date.parse('2026-09-21T03:00:00.000Z'),
    candidates: [{
      clan_id: '3', season: 'Season 3', member_id: 'chaos alpha', ign: 'CHAOS Alpha',
      level: 93, reputation: 6600, stamina: 119, max_stamina: 200,
      source: 'legacy-live', captured_at: '2026-09-21T03:00:00.000Z'
    }],
    previousByKey: new Map([[
      '3:chaos alpha',
      { clan_id: '3', member_id: 'chaos alpha', level: 92, reputation: 6543, stamina: 120, max_stamina: 200, captured_at: '2026-09-21T02:55:00.000Z' }
    ]])
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.changedCount, 1);
  assert.equal(result.rows[0].reputation, 6600);
  assert.equal(result.rows[0].raw_data, undefined);
});

test('unchanged members get an hourly heartbeat snapshot', () => {
  const result = selectChangedSnapshotRows({
    nowMs: Date.parse('2026-09-21T03:00:00.000Z'),
    candidates: [{
      clan_id: '3', season: 'Season 3', member_id: 'chaos alpha', ign: 'CHAOS Alpha',
      level: 92, reputation: 6543, stamina: 120, max_stamina: 200,
      source: 'legacy-live', captured_at: '2026-09-21T03:00:00.000Z'
    }],
    previousByKey: new Map([[
      '3:chaos alpha',
      { clan_id: '3', member_id: 'chaos alpha', level: 92, reputation: 6543, stamina: 120, max_stamina: 200, captured_at: '2026-09-21T01:59:00.000Z' }
    ]])
  });

  assert.equal(result.rows.length, 1);
  assert.equal(result.heartbeatCount, 1);
});

test('retention selects only snapshot rows older than the cutoff', () => {
  const cutoff = '2026-08-22T00:00:00.000Z';
  const ids = selectRetentionIds([
    { id: 1, captured_at: '2026-08-21T23:59:59.000Z' },
    { id: 2, captured_at: '2026-08-22T00:00:00.000Z' },
    { id: 3, captured_at: '2026-08-22T00:00:01.000Z' }
  ], cutoff);

  assert.deepEqual(ids, ['1']);
});
