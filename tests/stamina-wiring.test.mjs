import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('sync path advances calculated stamina before persisting member snapshots',async()=>{
  const source=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.match(source,/advanceCalculatedStamina\(db,\{/);
  assert.match(source,/db\.rpc\('advance_rep_tracker_stamina'/);
  assert.match(source,/const staminaById=new Map\(staminaStates\.map/);
  assert.match(source,/stamina:staminaById\.get\(String\(member\.id\)\)\?\.stamina/);
  assert.match(source,/upsertMembers\(\{clanId:config\.clan_id,season,members:live\.members,capturedAt,staminaById\}\)/);
});

test('dashboard exposes calculated stamina and only declares bleeding when the full live roster is tracked',async()=>{
  const source=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.match(source,/staminaTrackingReady=rows\.length>0&&trackedStaminaRows\.length===rows\.length/);
  assert.match(source,/calculateBleedingState\(trackedStaminaRows\)/);
  assert.match(source,/staminaSummary,/);
  assert.match(source,/mode:'CALCULATED'/);
  assert.match(source,/staminaTrackingReady/);
  assert.match(source,/staminaTrackingError/);
});

test('member UI labels stamina as calculated and keeps mobile table labels aligned',async()=>{
  const dashboard=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  const overview=await readFile(new URL('../app/components/OperationsOverview.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../app/rep-tracker.css',import.meta.url),'utf8');
  assert.match(dashboard,/STAMINA/);
  assert.match(dashboard,/CALCULATED FROM REP ACTIVITY · NOT SERVER-REPORTED STAMINA/);
  assert.match(dashboard,/summary\.stamina==null/);
  assert.match(overview,/CALCULATED STATUS/);
  assert.match(overview,/BLEEDING/);
  assert.match(css,/performance-table tbody td:nth-child\(6\)::before\{content:'STAMINA'\}/);
  assert.match(css,/.stamina-low/);
});

test('stamina migration provides atomic, season-scoped state and the RPC',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260923010000_calculated_stamina_bleeding.sql',import.meta.url),'utf8');
  assert.match(sql,/create table if not exists public\.rep_tracker_stamina_state/);
  assert.match(sql,/primary key \(clan_id, season, member_id\)/);
  assert.match(sql,/create or replace function public\.advance_rep_tracker_stamina/);
  assert.match(sql,/for update/);
  assert.match(sql,/last_recovery_at/);
  assert.match(sql,/p_current_rep bigint/);
  assert.match(sql,/revoke all on function public\.advance_rep_tracker_stamina/);
  assert.match(sql,/grant execute on function public\.advance_rep_tracker_stamina.*service_role/);
});
