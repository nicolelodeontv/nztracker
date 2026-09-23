import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLEEDING_STAMINA_THRESHOLD,
  calculateBleedingState,
  isBleedingMember,
  serverReportedStamina
} from '../app/lib/stamina-tracker.mjs';

test('missing server Stamina stays unavailable instead of being inferred from REP',()=>{
  assert.equal(serverReportedStamina({
    stamina:null,
    maxStamina:null,
    staminaKnown:false,
    maxStaminaKnown:false
  }),null);

  assert.equal(serverReportedStamina({
    stamina:170,
    maxStamina:200,
    staminaKnown:false,
    maxStaminaKnown:true
  }),null);
});

test('server-reported Stamina is surfaced only when both current and max values are known',()=>{
  assert.deepEqual(serverReportedStamina({
    stamina:0,
    maxStamina:200,
    staminaKnown:true,
    maxStaminaKnown:true
  }),{
    stamina:0,
    maxStamina:200,
    mode:'SERVER_REPORTED'
  });
});

test('bleeding is unavailable until the full roster has server-reported Stamina',()=>{
  const state=calculateBleedingState([
    {memberId:'a',stamina:null,serverReported:false},
    {memberId:'b',stamina:0,serverReported:true},
    {memberId:'c',stamina:40,serverReported:true},
    {memberId:'d',stamina:80,serverReported:true}
  ]);

  assert.equal(state.bleeding,null);
  assert.equal(state.trackingReady,false);
  assert.equal(state.mode,'SERVER_REPORTED_UNAVAILABLE');
  assert.equal(state.trackedMemberCount,3);
});

test('bleeding uses server-reported values once the full roster is verified',()=>{
  const state=calculateBleedingState([
    {memberId:'a',stamina:70,serverReported:true},
    {memberId:'b',stamina:40,serverReported:true},
    {memberId:'c',stamina:80,serverReported:true},
    {memberId:'d',stamina:90,serverReported:true}
  ]);

  assert.equal(state.lowStaminaCount,2);
  assert.equal(state.ratio,0.5);
  assert.equal(state.bleeding,true);
  assert.equal(state.threshold,BLEEDING_STAMINA_THRESHOLD);
  assert.equal(state.mode,'SERVER_REPORTED');
});

test('invalid and above-zero values do not create false bleeding state',()=>{
  assert.equal(isBleedingMember(null),false);
  assert.equal(isBleedingMember('not-a-number'),false);
  assert.equal(isBleedingMember(71),false);
  assert.equal(isBleedingMember(70),true);
});
