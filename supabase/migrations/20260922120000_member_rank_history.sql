alter table public.rep_tracker_member_latest
  add column if not exists rank integer,
  add column if not exists previous_rank integer;

create index if not exists rep_tracker_member_latest_rank_lookup
  on public.rep_tracker_member_latest (clan_id, season, rank);
