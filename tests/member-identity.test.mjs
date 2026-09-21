import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMembers as normalizeRouteMembers } from '../app/api/clan-members/route.js';
import { normalizeMembers as normalizeSourceMembers } from '../app/lib/ninja-source.mjs';

const implementations = [
  ['clan-members route', normalizeRouteMembers],
  ['shared ninja source', normalizeSourceMembers],
];

for (const [label, normalizeMembers] of implementations) {
  test(`${label}: uses normalized names only when the whole source has no IDs`, () => {
    const members = normalizeMembers([
      { name: ' CHAOS   Alpha ', level: 90, reputation: 123, member_number: 29 },
      { name: 'CHAOS Beta', level: 88, reputation: 45, member_number: 29 },
    ]);

    assert.deepEqual(
      members.map((member) => member.id),
      ['chaos alpha', 'chaos beta'],
    );
    assert.equal(members[0].id, 'chaos alpha');
    assert.equal(members[1].id, 'chaos beta');
  });

  test(`${label}: preserves real IDs and drops members without IDs when IDs are present`, () => {
    const members = normalizeMembers([
      { id: 6252, name: 'CHAOS Mango', level: 100, reputation: 1000, member_number: 29 },
      { name: 'CHAOS NoId', level: 99, reputation: 900, member_number: 29 },
      { id: '9001', name: 'CHAOS Other', level: 98, reputation: 800, member_number: 29 },
    ]);

    assert.deepEqual(
      members.map((member) => member.id),
      ['6252', '9001'],
    );
    assert.equal(members.some((member) => member.id === '29'), false);
    assert.equal(members.some((member) => member.name === 'CHAOS NoId'), false);
  });
}
