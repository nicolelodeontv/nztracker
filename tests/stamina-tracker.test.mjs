import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAMINA_MAX,
  STAMINA_RECOVERY_AMOUNT,
  STAMINA_RECOVERY_INTERVAL_MS,
  STAMINA_DRAIN_PER_REP_GAIN,
  BLEEDING_STAMINA_THRESHOLD,
  calculateBleedingState,
  calculateStaminaStep,
  recoveryIntervalsElapsed
} from '../app/lib/stamina-tracker.mjs';

test('first observed member starts at full calculated stamina without a synthetic drain',()=>{
  const result=calculateStaminaStep({
    previousStamina:STAMINA_MAX,
    previousRep:null,
    currentRep:1000,
    capturedAt:'2026-09-23T00:00:00.000Z'
  });
  assert.equal(result.stamina,STAMINA_MAX);
  assert.equal(result.drained,0);
  assert.equal(result.repGain,0);
  assert.equal(result.mode,'CALCULATED');
});

test('a real positive REP change drains exactly one tracked event',()=>{
  const result=calculateStaminaStep({
    previousStamina:200,
    previousRep:1000,
    currentRep:2500,
    previousCalculatedAt:'2026-09-23T00:00:00.000Z',
    capturedAt:'2026-09-23T00:05:00.000Z'
  });
  assert.equal(result.repGain,1500);
  assert.equal(result.drained,STAMINA_DRAIN_PER_REP_GAIN);
  assert.equal(result.stamina,190);
});

test('unchanged or decreased REP does not drain stamina',()=>{
  const unchanged=calculateStaminaStep({
    previousStamina:120,
    previousRep:2500,
    currentRep:2500,
    previousCalculatedAt:'2026-09-23T00:00:00.000Z',
    capturedAt:'2026-09-23T00:05:00.000Z'
  });
  const reset=calculateStaminaStep({
    previousStamina:120,
    previousRep:2500,
    currentRep:1500,
    previousCalculatedAt:'2026-09-23T00:00:00.000Z',
    capturedAt:'2026-09-23T00:05:00.000Z'
  });
  assert.equal(unchanged.stamina,120);
  assert.equal(reset.stamina,120);
});

test('recovery uses elapsed 30-minute intervals and caps at 200',()=>{
  const previousCalculatedAt='2026-09-23T00:00:00.000Z';
  const capturedAt=new Date(Date.parse(previousCalculatedAt)+3*STAMINA_RECOVERY_INTERVAL_MS+5*60*1000).toISOString();
  assert.equal(recoveryIntervalsElapsed(previousCalculatedAt,capturedAt),3);
  const result=calculateStaminaStep({
    previousStamina:20,
    previousRep:1000,
    currentRep:1000,
    previousCalculatedAt,
    capturedAt
  });
  assert.equal(result.recovered,180);
  assert.equal(result.stamina,200);
});

test('bleeding starts when at least half of the live roster is at or below 70',()=>{
  const state=calculateBleedingState([
    {memberId:'a',stamina:70},
    {memberId:'b',stamina:40},
    {memberId:'c',stamina:80},
    {memberId:'d',stamina:90}
  ]);
  assert.equal(state.lowStaminaCount,2);
  assert.equal(state.ratio,0.5);
  assert.equal(state.bleeding,true);
  assert.equal(state.threshold,BLEEDING_STAMINA_THRESHOLD);
});

test('bleeding stays clear below the 50 percent roster threshold',()=>{
  const state=calculateBleedingState([
    {memberId:'a',stamina:70},
    {memberId:'b',stamina:71},
    {memberId:'c',stamina:80},
    {memberId:'d',stamina:90}
  ]);
  assert.equal(state.lowStaminaCount,1);
  assert.equal(state.bleeding,false);
});

test('calculated stamina never drops below zero',()=>{
  const result=calculateStaminaStep({
    previousStamina:5,
    previousRep:1000,
    currentRep:2000,
    previousCalculatedAt:'2026-09-23T00:00:00.000Z',
    capturedAt:'2026-09-23T00:00:10.000Z'
  });
  assert.equal(result.stamina,0);
});
