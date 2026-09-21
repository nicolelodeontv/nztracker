-- Run after the canonical tracker code is deployed and verified.
-- These tables belong to the retired multi-source / 5-minute pipeline.
-- The preceding migration copies clan ranking history into the canonical table.

drop table if exists public.leaderboard_history;
drop table if exists public.leaderboard_entries;
drop table if exists public.clan_ranking_history;
drop table if exists public.clan_rankings;
drop table if exists public.sync_runs;
drop table if exists public.sync_log;
drop table if exists public.clan_history;
drop table if exists public.clans;
drop table if exists public.clan_member_events;
drop table if exists public.clan_members;
