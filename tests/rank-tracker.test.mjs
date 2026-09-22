import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRankChanges, compareMemberRank, formatRankChange, sortMembersByRank } from '../app/lib/rank-tracker.mjs';

test('rank deltas persist correctly across three consecutive snapshots',()=>{
  const first=applyRankChanges([
    {id:'a',name:'A',reputation:300},
    {id:'b',name:'B',reputation:200},
    {id:'c',name:'C',reputation:100}
  ]);
  const firstRanks=new Map(first.map((row)=>[row.id,row.rank]));
  assert.deepEqual(first.map((row)=>row.rankDelta),[null,null,null]);

  const second=applyRankChanges([
    {id:'b',name:'B',reputation:400},
    {id:'a',name:'A',reputation:300},
    {id:'c',name:'C',reputation:100}
  ],firstRanks);
  const secondRanks=new Map(second.map((row)=>[row.id,row.rank]));
  assert.deepEqual(second.map((row)=>({id:row.id,rankDelta:row.rankDelta})),[
    {id:'b',rankDelta:1},
    {id:'a',rankDelta:-1},
    {id:'c',rankDelta:0}
  ]);

  const third=applyRankChanges([
    {id:'c',name:'C',reputation:500},
    {id:'b',name:'B',reputation:450},
    {id:'a',name:'A',reputation:300}
  ],secondRanks);
  assert.deepEqual(third.map((row)=>({id:row.id,rankDelta:row.rankDelta})),[
    {id:'c',rankDelta:2},
    {id:'b',rankDelta:-1},
    {id:'a',rankDelta:-1}
  ]);
});

test('new members have no false rank indicator and labels are stable',()=>{
  const rows=applyRankChanges([{id:'new',name:'New',reputation:100}]);
  assert.equal(rows[0].rankDelta,null);
  assert.equal(formatRankChange(null),'—');
  assert.equal(formatRankChange(3),'▲3');
  assert.equal(formatRankChange(-2),'▼2');
  assert.equal(formatRankChange(0),'—');
});

test('rank ordering keeps tied REP members in the same final order as their displayed ranks',()=>{
  const assigned=applyRankChanges([
    {id:'rep400-low-id',name:'Rep400 Low ID',reputation:400,level:80},
    {id:'rep400-high-level',name:'Rep400 High Level',reputation:400,level:90},
    {id:'rep400-other-level90',name:'Rep400 Other Level 90',reputation:400,level:90},
    {id:'zero-b',name:'Zero B',reputation:0,level:70},
    {id:'zero-a',name:'Zero A',reputation:0,level:70}
  ]);

  const displayedOrder=sortMembersByRank(assigned.slice().reverse()).map((row)=>row.id);

  assert.deepEqual(displayedOrder, assigned.map((row)=>row.id));
  assert.deepEqual(sortMembersByRank(assigned.slice().reverse()).map((row)=>row.rank), [1,2,3,4,5]);
  assert.equal(compareMemberRank(assigned[1],assigned[0]),1);
  assert.deepEqual(assigned.map((row)=>({id:row.id,rank:row.rank})),[
    {id:'rep400-high-level',rank:1},
    {id:'rep400-other-level90',rank:2},
    {id:'rep400-low-id',rank:3},
    {id:'zero-a',rank:4},
    {id:'zero-b',rank:5}
  ]);
});
