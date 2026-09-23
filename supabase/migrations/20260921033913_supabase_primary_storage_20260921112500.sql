create table if not exists public.rep_tracker_member_points (
  clan_id text not null,
  season text not null,
  member_id text not null,
  member_name text not null,
  level int not null default 0,
  rep int not null,
  captured_at timestamptz not null,
  primary key (clan_id, season, member_id, captured_at)
);

create index if not exists rep_tracker_member_points_lookup
  on public.rep_tracker_member_points (clan_id, season, captured_at desc);

create table if not exists public.rep_tracker_member_latest (
  clan_id text not null,
  season text not null,
  member_id text not null,
  member_name text not null,
  level int not null default 0,
  rep int not null,
  last_point_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (clan_id, season, member_id)
);

create table if not exists public.rep_tracker_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.rep_tracker_member_points enable row level security;
alter table public.rep_tracker_member_latest enable row level security;
alter table public.rep_tracker_kv enable row level security;

grant all on table public.rep_tracker_member_points to service_role;
grant all on table public.rep_tracker_member_latest to service_role;
grant all on table public.rep_tracker_kv to service_role;
