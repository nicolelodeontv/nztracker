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

test('nav removes only excess top spacing while preserving bottom spacing and logout spacing',async()=>{
  const source=await readFile(new URL('../app/rep-tracker.css',import.meta.url),'utf8');
  const dashboard=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  assert.match(source,/\.ops-header\{[^\n]*margin-bottom:0/);
  assert.match(source,/\.ops-nav\{[^\n]*margin-bottom:26px[^\n]*padding:0 10px 12px/);
  assert.match(source,/@media\(max-width:720px\)[\s\S]*?\.ops-header\{[^}]*margin-bottom:0/);
  assert.match(source,/@media\(max-width:720px\)[\s\S]*?\.ops-nav\{[^}]*margin-bottom:20px[^}]*padding:0 8px 12px/);
  assert.match(source,/\.ops-nav button\.active::after\{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px/);
  assert.match(source,/.admin-logout-actions\{margin-top:20px\}/);
  assert.match(dashboard,/className="actions admin-logout-actions"/);
});


test('header brand lockup is spaced, fully clickable, and routes to Dashboard',async()=>{
  const source=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../app/rep-tracker.css',import.meta.url),'utf8');
  assert.match(source,/import Link from 'next\/link';/);
  const brandLinkMatches = source.match(/<Link className="brand" href="\/" aria-label="Go to Dashboard">/g) ?? [];
  assert.equal(brandLinkMatches.length,4);
  assert.match(source,/<b>CHAOS<\/b>\{\' \'\}<span>REP TRACKER<\/span><small>Ninja Zenshin Clan Operations<\/small>/);
  assert.match(source,/brand-logo.*Ninja Zenshin Clan Operations/);
  assert.match(css,/.brand\{[^}]*text-decoration:none;color:inherit;cursor:pointer/);
  assert.match(css,/.brand:focus-visible\{/);
});

test('unverified Stamina is withheld from prominent dashboard data',async()=>{
  const dashboard=await readFile(new URL('../app/components/RepTrackerDashboard.js',import.meta.url),'utf8');
  const overview=await readFile(new URL('../app/components/OperationsOverview.js',import.meta.url),'utf8');
  const tracker=await readFile(new URL('../app/lib/rep-tracker.js',import.meta.url),'utf8');
  assert.match(dashboard,/showStaminaColumn/);
  assert.match(dashboard,/STAMINA DATA UNAVAILABLE/);
  assert.match(dashboard,/DO NOT USE STAMINA DATA FOR REWARD OR BLEEDING DECISIONS/);
  assert.match(overview,/STAMINA DATA UNAVAILABLE/);
  assert.match(overview,/REP-derived estimation is disabled/);
  assert.match(tracker,/staminaMode:staminaSourceReady&&row\.stamina!=null\?'SERVER_REPORTED':null/);
  assert.match(tracker,/mode:'SERVER_REPORTED_UNAVAILABLE'/);
});
