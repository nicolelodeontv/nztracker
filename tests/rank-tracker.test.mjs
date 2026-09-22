import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRankChanges, formatRankChange } from '../app/lib/rank-tracker.mjs';

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
