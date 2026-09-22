import test from 'node:test';
import assert from 'node:assert/strict';
import { finalResultsToCsv } from '../app/lib/final-export.mjs';

test('final results CSV matches the required on-screen standings fields',()=>{
  const csv=finalResultsToCsv([
    {rank:1,member:'Alpha,One',level:80,rep:12000,gain:5000},
    {rank:2,member:'Beta',level:79,rep:10000,gain:3000}
  ]);
  assert.equal(csv,
    'Rank,Member Name,Level,Final REP,REP Gained\r\n'
    +'1,"Alpha,One",80,12000,5000\r\n'
    +'2,Beta,79,10000,3000\r\n'
  );
});

test('final results CSV falls back to row order for older finalized snapshots without rank metadata',()=>{
  const csv=finalResultsToCsv([{member:'Alpha',level:80,rep:100,gain:10}]);
  assert.match(csv,/^Rank,Member Name,Level,Final REP,REP Gained\r\n1,Alpha,80,100,10/);
});
