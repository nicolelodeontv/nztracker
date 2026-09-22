import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard exposes rank movement on Dashboard and Members and renders the clan REP trend',async()=>{
  const source=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  assert.match(source,/rank-movement/);
  assert.match(source,/formatRankChange\(r\.rankDelta\)/);
  assert.match(source,/r\.rankDelta!=null/);
  assert.match(source,/<ClanRepTrendChart points=\{data\.clanRepTrend\}\/>/);
  assert.match(source,/LIVE MEMBER RANKING/);
  assert.match(source,/MEMBER INTELLIGENCE/);
});

test('final CSV control is only rendered when a finalized result exists',async()=>{
  const source=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  assert.match(source,/{latestFinal&&<div className="actions">/);
  assert.match(source,/api\/export\?type=final&format=csv&season=/);
  assert.match(source,/FINAL DAY NOT LOCKED/);
});

test('ranking persistence migration is additive and indexed',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260922120000_member_rank_history.sql',import.meta.url),'utf8');
  assert.match(sql,/add column if not exists rank integer/);
  assert.match(sql,/add column if not exists previous_rank integer/);
  assert.match(sql,/rep_tracker_member_latest_rank_lookup/);
});
