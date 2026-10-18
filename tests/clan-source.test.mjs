import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseClanPage } from '../app/lib/clan-source.mjs';

test('parses finished war results using the canonical text season format', () => {
  const html = `
    <h2>Clan Ranking Season 3</h2>
    <table>
      <tr><th>Rank</th><th>Clan</th><th>Master</th><th>Members</th><th>Reputation</th></tr>
      <tr><td>1</td><td><a href="/clan-ranking/chaos123">CHAOS &amp; Friends</a></td><td>Michol</td><td>15 / 20</td><td>100,000</td></tr>
      <tr><td>2</td><td><a href="/clan-ranking/north456">North Star</a></td><td>Ari</td><td>12 / 20</td><td>90,000</td></tr>
      <tr><td>3</td><td><a href="/clan-ranking/moon789">Blue Moon</a></td><td>Jo</td><td>10 / 20</td><td>80,000</td></tr>
      <tr><td>4</td><td><a href="/clan-ranking/fox111">Red Fox</a></td><td>Lee</td><td>9 / 20</td><td>70,000</td></tr>
      <tr><td>5</td><td><a href="/clan-ranking/pine222">Silver Pine</a></td><td>Sam</td><td>8 / 20</td><td>60,000</td></tr>
    </table>
    <h2>Season 3 — Clan War Result</h2>
    <p>Ended 19 Oct 2026</p>
    <table>
      <tr><th>Rank</th><th>Clan</th><th>Members</th><th>Reputation</th></tr>
      <tr><td>1</td><td>CHAOS &amp; Friends</td><td>15</td><td>110,000</td></tr>
      <tr><td>2</td><td>North Star</td><td>12</td><td>99,000</td></tr>
    </table>`;

  const parsed = parseClanPage(html);
  assert.deepEqual(Object.keys(parsed), ['war']);
  assert.deepEqual(parsed.war, [
    {
      season: 'Season 3',
      rank: 1,
      clan_name: 'CHAOS & Friends',
      members: 15,
      reputation: 110000,
      ended_on: '2026-10-19'
    },
    {
      season: 'Season 3',
      rank: 2,
      clan_name: 'North Star',
      members: 12,
      reputation: 99000,
      ended_on: '2026-10-19'
    }
  ]);
});

test('finished war parser ignores tables without season context and the current ranking table', () => {
  const html = `
    <table>
      <tr><th>Rank</th><th>Clan</th><th>Master</th><th>Members</th><th>Reputation</th></tr>
      <tr><td>1</td><td>CHAOS</td><td>Michol</td><td>15 / 20</td><td>100,000</td></tr>
    </table>
    <table>
      <tr><th>Rank</th><th>Clan</th><th>Members</th><th>Reputation</th></tr>
      <tr><td>1</td><td>Unlabeled result</td><td>15</td><td>100,000</td></tr>
    </table>`;
  assert.deepEqual(parseClanPage(html), { war: [] });
});

test('clan-war sync source never writes canonical ranking history', async () => {
  const source = await readFile(new URL('../app/lib/clan-source.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /recordRankingSnapshot|rep_tracker_ranking_history|ranking-cache/);
});
