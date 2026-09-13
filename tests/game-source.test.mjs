import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGamePage } from '../lib/game-source.mjs';

test('parses independent clan, pve and pvp tables with separate season/round', () => {
  const html = `<!doctype html><html><body>
    <h2>PvE Leaderboard</h2><p>Season 3 · Round 2/2</p>
    <table><thead><tr><th>#</th><th>Character</th><th>Score</th></tr></thead><tbody>
      <tr><td>1</td><td>Player A</td><td>309,500</td></tr><tr><td>2</td><td>Player B</td><td>129,000</td></tr>
    </tbody></table>
    <h2>PvP Leaderboard</h2><p>Season 0 · Round 1/1</p>
    <table><thead><tr><th>#</th><th>Character</th><th>Score</th><th>Win / Lose</th></tr></thead><tbody>
      <tr><td>1</td><td>Player A</td><td>550</td><td>64 / ~~22~~</td></tr>
    </tbody></table>
    <h2>Clan Ranking</h2><p>Season 2</p>
    <table><thead><tr><th>#</th><th>Clan</th><th>Master</th><th>Members</th><th>Reputation</th></tr></thead><tbody>
      <tr data-clan="3"><td>9</td><td>Chaos</td><td>CHAOS Mango</td><td>30/30</td><td>542,770</td></tr>
    </tbody></table>
  </body></html>`;
  const result = parseGamePage(html);
  assert.equal(result.clanRanking[0].clanId, '3');
  assert.equal(result.season, 'Season 2');
  assert.equal(result.pve.season, 'Season 3');
  assert.equal(result.pve.round, '2/2');
  assert.equal(result.pve.rows[0].score, 309500);
  assert.equal(result.pvp.season, 'Season 0');
  assert.equal(result.pvp.rows[0].wins, 64);
  assert.equal(result.pvp.rows[0].losses, 22);
});
