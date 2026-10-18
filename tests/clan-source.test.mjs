import assert from 'node:assert/strict';
import test from 'node:test';
import { hashRanking, parseClanPage } from '../app/lib/clan-source.mjs';

test('parses public ranking and finished clan-war tables', () => {
  const html = `
    <h2>Clan Ranking</h2>
    <table>
      <tr><th>Rank</th><th>Clan</th><th>Master</th><th>Members</th><th>Reputation</th></tr>
      <tr><td>1</td><td>CHAOS &amp; Friends</td><td>Michol</td><td>15 / 20</td><td>100,000</td></tr>
      <tr><td>2</td><td>North Star</td><td>Ari</td><td>12 / 20</td><td>90,000</td></tr>
      <tr><td>3</td><td>Blue Moon</td><td>Jo</td><td>10 / 20</td><td>80,000</td></tr>
      <tr><td>4</td><td>Red Fox</td><td>Lee</td><td>9 / 20</td><td>70,000</td></tr>
      <tr><td>5</td><td>Silver Pine</td><td>Sam</td><td>8 / 20</td><td>60,000</td></tr>
    </table>
    <h2>Season 3 — Clan War Result</h2>
    <p>Ended 19 Oct 2026</p>
    <table>
      <tr><th>Rank</th><th>Clan</th><th>Members</th><th>Reputation</th></tr>
      <tr><td>1</td><td>CHAOS &amp; Friends</td><td>15</td><td>110,000</td></tr>
      <tr><td>2</td><td>North Star</td><td>12</td><td>99,000</td></tr>
    </table>`;

  const parsed = parseClanPage(html);
  assert.equal(parsed.ranking.closed, false);
  assert.equal(parsed.ranking.rows.length, 5);
  assert.deepEqual(parsed.ranking.rows[0], {
    rank: 1,
    clan_name: 'CHAOS & Friends',
    master: 'Michol',
    members: 15,
    member_cap: 20,
    reputation: 100000
  });
  assert.deepEqual(parsed.war, [
    {
      season: 3,
      rank: 1,
      clan_name: 'CHAOS & Friends',
      members: 15,
      reputation: 110000,
      ended_on: '2026-10-19'
    },
    {
      season: 3,
      rank: 2,
      clan_name: 'North Star',
      members: 12,
      reputation: 99000,
      ended_on: '2026-10-19'
    }
  ]);
});

test('ranking hash is stable and responds to ranking changes', () => {
  const rows = [
    { rank: 1, clan_name: 'CHAOS', master: 'Michol', members: 15, reputation: 100000 },
    { rank: 2, clan_name: 'North Star', master: 'Ari', members: 12, reputation: 90000 }
  ];
  assert.equal(hashRanking(rows, false), hashRanking(rows, false));
  assert.notEqual(hashRanking(rows, false), hashRanking([...rows, { ...rows[1], rank: 3 }], false));
  assert.notEqual(hashRanking(rows, false), hashRanking(rows, true));
});
