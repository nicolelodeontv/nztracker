create table if not exists public.rep_tracker_ranking_history (
  season text not null,
  clan_id text not null,
  rank integer not null,
  clan_name text not null,
  master text,
  member_current integer not null default 0,
  member_max integer not null default 0,
  reputation bigint not null default 0,
  source text,
  snapshot_at timestamptz not null,
  raw_data jsonb,
  primary key (season, clan_id, snapshot_at)
);

create index if not exists rep_tracker_ranking_history_lookup
  on public.rep_tracker_ranking_history (season, clan_id, snapshot_at desc);

create index if not exists rep_tracker_ranking_history_season_time
  on public.rep_tracker_ranking_history (season, snapshot_at desc);

alter table public.rep_tracker_ranking_history enable row level security;

revoke all privileges on table public.rep_tracker_ranking_history from public, anon, authenticated;
grant all on table public.rep_tracker_ranking_history to service_role;

insert into public.rep_tracker_ranking_history (
  season, clan_id, rank, clan_name, master, member_current, member_max, reputation, source, snapshot_at, raw_data
)
select
  season,
  clan_id,
  rank,
  clan_name,
  master,
  member_current,
  member_max,
  reputation,
  source,
  snapshot_at,
  raw_data
from public.clan_ranking_history
where clan_id is not null
  and season is not null
  and snapshot_at is not null
on conflict (season, clan_id, snapshot_at) do nothing;
