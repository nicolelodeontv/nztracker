import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMembers } from '../app/lib/ninja-source.mjs';
import { buildRepTrackerSnapshotRows } from '../lib/multisource-db.mjs';
import { summarizeMemberRecording } from '../app/api/sync-all/route.js';

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
