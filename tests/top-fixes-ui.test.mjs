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

test('rep pace lists and Global Top expose the repaired states',async()=>{
  const source=await readFile(new URL('../app/components/OperationsOverview.js',import.meta.url),'utf8');
  assert.match(source,/selectTopBurn\(rows,5\)/);
  assert.match(source,/selectNeedsAttention\(rows,6\)/);
  assert.match(source,/memberDisplayName\(row\)/);
  assert.match(source,/attention-member/);
  assert.match(source,/TOP BURN/);
  assert.match(source,/NEEDS ATTENTION/);
});

test('ranking persistence migration is additive and indexed',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20260922120000_member_rank_history.sql',import.meta.url),'utf8');
  assert.match(sql,/add column if not exists rank integer/);
  assert.match(sql,/add column if not exists previous_rank integer/);
  assert.match(sql,/rep_tracker_member_latest_rank_lookup/);
});

test('sync path persists member ranks and records fresh ranking history',async()=>{
  const source=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.match(source,/applyRankChanges\(members,previousRanks\)/);
  assert.match(source,/previous_rank:rankState\?\.previousRank/);
  assert.match(source,/recordRankingSnapshot\(/);
  assert.match(source,/readRankingHistory\(\{clanId:config\.clan_id,season/);
});
test('rank order is the shared render order on Dashboard, SSR data, and Members',async()=>{
  const source=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  const tracker=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.match(source,/compareMemberRank, formatRankChange, sortMembersByRank/);
  assert.match(source,/const rows = useMemo\(\(\) => sortMembersByRank\(data\?\.rows \|\| \[\]\), \[data\?\.rows\]\)/);
  assert.match(source,/if\(memberSort==='gain'\)/);
  assert.match(source,/return compareMemberRank\(a,b\);/);
  assert.match(tracker,/import \{ applyRankChanges, sortMembersByRank \} from '\.\/rank-tracker\.mjs';/);
  assert.match(tracker,/const orderedRows=sortMembersByRank\(rows\);/);
  assert.match(tracker,/configured:true,config,season,rows:orderedRows/);
});

test('Global Top distinguishes per-clan tracking state from a global history flag',async()=>{
  const source=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  const overview=await readFile(new URL('../app/components/OperationsOverview.js',import.meta.url),'utf8');
  assert.match(source,/previousTracked:/);
  assert.match(source,/String\(previous\.clanId\|\|previous\.clan\|\|''\)===clanKey/);
  assert.match(overview,/formatGlobalMove\(row\.change,row\.previousTracked\)/);
  assert.match(overview,/rankingGap\(row,ranking\)/);
});

test('nav and admin logout spacing use the shared responsive layout rules',async()=>{
  const source=await readFile(new URL('../app/rep-tracker.css',import.meta.url),'utf8');
  const dashboard=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  assert.match(source,/\.ops-nav\{[^\n]*padding:12px 10px/);
  assert.match(source,/@media\(max-width:720px\)[\s\S]*?padding:12px 8px/);
  assert.match(source,/.admin-logout-actions\{margin-top:20px\}/);
  assert.match(dashboard,/className="actions admin-logout-actions"/);
});
