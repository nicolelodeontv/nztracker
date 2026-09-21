import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodePacket, extractMembers } from './helpers/donation-amf-decoder.mjs';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'member-list.b64');

test('extractMembers handles numeric-keyed AMF member objects', () => {
  const members = extractMembers({
    result: {
      member_number: 29,
      '1': { id: 6252, name: 'CHAOS Mango', donated_gold: 69, donated_token: 69 },
      '0': { id: 7001, name: 'CHAOS Alpha', donated_gold: 100, donated_token: 2 },
      ignored: { id: 9999, name: 'Ignored', donated_gold: 1, donated_token: 1 },
    },
  });

  assert.deepEqual(members.map((member) => member.id), ['7001', '6252']);
  assert.equal(members[0].donated_gold, 100);
  assert.equal(members[1].donated_token, 69);
});

test('extractMembers drops members without a real numeric id', () => {
  const members = extractMembers({
    result: {
      member_number: 29,
      '0': { name: 'No ID', donated_gold: 100, donated_token: 2 },
      '1': { id: 6252, name: 'CHAOS Mango', donated_gold: 69, donated_token: 69 },
    },
  });

  assert.deepEqual(members.map((member) => member.id), ['6252']);
});

test('real member-list AMF fixture decodes 29 members and expected donation fields', async () => {
  const encoded = (await readFile(fixturePath, 'utf8')).replace(/\s+/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  assert.ok(bytes.length > 0, 'member-list.b64 must contain a base64-encoded AMF response');

  const body = decodePacket(bytes);
  const members = extractMembers(body);

  assert.equal(members.length, 29);

  const nnao = members.find((member) => member.name === 'CHAOS Nnao');
  assert.ok(nnao, 'CHAOS Nnao must be present');
  assert.equal(nnao.donated_gold, 10000000);
  assert.equal(nnao.donated_token, 2000);

  const michol = members.find((member) => member.name === 'CHAOS Michol');
  assert.ok(michol, 'CHAOS Michol must be present');
  assert.equal(michol.stamina, 40);
  assert.equal(michol.reputation_gain, 225);
  assert.equal(michol.donated_gold, 69);
  assert.equal(michol.donated_token, 69);

  const calculate = members.find((member) => member.name === 'CHAOS Calculate');
  assert.ok(calculate, 'CHAOS Calculate must be present');
  assert.equal(calculate.reputation_gain, 350);
  assert.equal(calculate.donated_gold, 696969);
});
