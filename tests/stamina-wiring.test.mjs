import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sync path uses only server-reported Stamina and never infers it from REP',async()=>{
  const source=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/advanceCalculatedStamina/);
  assert.match(source,/serverReportedStamina\(member\)/);
  assert.match(source,/const staminaKnownMembers=/);
  assert.match(source,/const staminaSource=/);
  assert.match(source,/staminaTracking:staminaSource/);
  assert.match(
    source,
    /stamina:staminaById\.get\(String\(row\.member_id\)\)\?\.stamina\?\?null,/
  );
  assert.match(
    source,
    /max_stamina:staminaById\.get\(String\(row\.member_id\)\)\?\.maxStamina\?\?null,/
  );
});

test('dashboard exposes verified server-reported Stamina only when the full roster is known',async()=>{
  const source=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.match(source,/staminaSourceReady=String\(syncHealth\?\.lastStaminaSource\|\|''\)==='server-reported'/);
  assert.match(source,/staminaMode:staminaSourceReady&&\(liveStamina!=null\|\|row\.stamina!=null\)\?'SERVER_REPORTED':null/);
  assert.match(source,/mode:'SERVER_REPORTED_UNAVAILABLE'/);
  assert.match(source,/trackingReady:false/);
});

test('member UI does not present inferred Stamina while the source is unverified',async()=>{
  const dashboard=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  const overview=await readFile(new URL('../app/components/OperationsOverview.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../app/rep-tracker.css',import.meta.url),'utf8');
  assert.match(dashboard,/showStaminaColumn/);
  assert.doesNotMatch(dashboard,/estimated-stamina-value/);
  assert.match(dashboard,/STAMINA DATA UNAVAILABLE/);
  assert.match(dashboard,/DO NOT USE STAMINA DATA FOR REWARD OR BLEEDING DECISIONS/);
  assert.match(overview,/STAMINA DATA UNAVAILABLE/);
  assert.match(overview,/REP-derived estimation is disabled/);
  assert.match(css,/\.stamina-hold-banner/);
});

test('stamina migration remains isolated from the application source of truth',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260923010000_calculated_stamina_bleeding.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists public\.rep_tracker_stamina_state/);
  assert.match(sql,/create or replace function public\.advance_rep_tracker_stamina/);
  assert.match(sql,/revoke all on function public\.advance_rep_tracker_stamina/);
});
