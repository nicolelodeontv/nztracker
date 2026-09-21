import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractRawMembers, parseMemberResponse, normalizeMembers } from '../app/api/clan-members/route.js';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'member-list.b64');

test('extractRawMembers handles numeric-keyed AMF result objects', () => {
  const body = {
    result: {
      '1': { name: 'Beta' },
      '0': { name: 'Alpha' },
      ignored: { name: 'Ignored' },
    },
  };
  assert.deepEqual(extractRawMembers(body).map((member) => member.name), ['Alpha', 'Beta']);
});

test('real member-list fixture decodes 29 members with stable IDs and donation fields', async () => {
  const encoded = (await readFile(fixturePath, 'utf8')).replace(/\s+/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  assert.ok(bytes.length > 0, 'tests/fixtures/member-list.b64 must contain base64 data');

  const body = parseMemberResponse(bytes);
  const members = normalizeMembers(extractRawMembers(body));

  assert.equal(members.length, 29);
  assert.equal(members.every((member) => /^\d+$/.test(String(member.id))), true);

  const nnao = members.find((member) => member.name === 'CHAOS Nnao');
  assert.ok(nnao, 'CHAOS Nnao must be present');
  assert.equal(nnao.donatedGold, 10000000);
  assert.equal(nnao.donatedToken, 2000);

  const michol = members.find((member) => member.name === 'CHAOS Michol');
  assert.ok(michol, 'CHAOS Michol must be present');
  assert.equal(michol.stamina, 40);
  assert.equal(michol.reputationGain, 225);
  assert.equal(michol.donatedGold, 69);
  assert.equal(michol.donatedToken, 69);
});
