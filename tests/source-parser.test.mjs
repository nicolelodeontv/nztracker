import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingHtml } from '../app/lib/source-parser.mjs';

test('ranking parser is resilient to column order changes', () => {
  const html = `
    <div>Clan Ranking Season 2</div>
    <div class="clr-cd"><span data-d>20</span><span data-h>8</span><span data-m>14</span><span data-s>09</span></div>
    <table>
      <thead><tr><th>Rank</th><th>Clan</th><th>Reputation</th><th>Master</th><th>Members</th><th>Extra</th></tr></thead>
      <tbody>
        <tr><td>2</td><td><a href="/clan-ranking/abc123">Sky</a></td><td>267,419</td><td>Leader</td><td>24 / 30</td><td>x</td></tr>
      </tbody>
    </table>`;

  const result = parseRankingHtml(html);
  assert.equal(result.season, 'Season 2');
  assert.deepEqual(result.countdown, {
    days: 20,
    hours: 8,
    minutes: 14,
    seconds: 9,
    remainingSeconds: 20 * 86400 + 8 * 3600 + 14 * 60 + 9
  });
  assert.deepEqual(result.rows[0], {
    rank: 2,
    clan: 'Sky',
    master: 'Leader',
    memberCurrent: 24,
    memberMax: 30,
    reputation: 267419,
    clanId: 'abc123'
  });
});
