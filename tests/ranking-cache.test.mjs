import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRankingChanges, globalRankSummary, rankingSnapshotNeedsRefresh, RANKING_REFRESH_MAX_AGE_MS } from '../app/lib/ranking-cache.js';

test('ranking changes compare current and previous snapshots',()=>{
  const changes=computeRankingChanges([
    {clanId:'3',rank:5,reputation:30000},
    {clanId:'6',rank:2,reputation:40000}
  ],[
    {clanId:'3',rank:6,reputation:29500},
    {clanId:'6',rank:2,reputation:40000}
  ]);
  assert.deepEqual(changes['3'],{
    rankDelta:1,
    reputationDelta:500,
    fromRank:6,
    toRank:5,
    fromReputation:29500,
    toReputation:30000
  });
  assert.equal(changes['6'],undefined);
});

test('ranking snapshot refresh policy is minute-level',()=>{
  const now=Date.parse('2026-09-22T00:01:00.000Z');
  assert.equal(rankingSnapshotNeedsRefresh(null,now),true);
  assert.equal(rankingSnapshotNeedsRefresh({fetchedAt:'2026-09-22T00:00:30.000Z'},now),false);
  assert.equal(rankingSnapshotNeedsRefresh({fetchedAt:'2026-09-22T00:00:00.000Z'},now),true);
  assert.equal(RANKING_REFRESH_MAX_AGE_MS,60000);
});

test('global rank summary exposes target gap',()=>{
  const summary=globalRankSummary([
    {clanId:'6',rank:1,clan:'A',reputation:50000,memberCurrent:30,memberMax:30},
    {clanId:'3',rank:2,clan:'Chaos',reputation:47000,memberCurrent:30,memberMax:30},
    {clanId:'8',rank:3,clan:'B',reputation:45000,memberCurrent:25,memberMax:30}
  ],'3');
  assert.equal(summary.rank,2);
  assert.equal(summary.above.clan,'A');
  assert.equal(summary.above.gap,3000);
  assert.equal(summary.below.gap,2000);
});
