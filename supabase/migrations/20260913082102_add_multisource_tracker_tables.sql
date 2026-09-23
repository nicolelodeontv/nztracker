create table if not exists public.leaderboard_entries (
  id bigint generated always as identity primary key,
  board_type text not null check (board_type in ('pve','pvp')),
  season text not null,
  round text not null default '',
  rank integer not null,
  player_name text not null default '',
  score bigint not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  title text,
  badge text,
  source text,
  captured_at timestamptz not null default now(),
  raw_data jsonb,
  updated_at timestamptz not null default now(),
  unique(board_type, season, round, rank)
);

create index if not exists leaderboard_entries_player_idx on public.leaderboard_entries (player_name, board_type);
create index if not exists leaderboard_entries_score_idx on public.leaderboard_entries (board_type, score desc);

create table if not exists public.leaderboard_history (
  id bigint generated always as identity primary key,
  board_type text not null check (board_type in ('pve','pvp')),
  season text not null,
  round text not null default '',
  rank integer not null,
  player_name text not null default '',
  score bigint not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  title text,
  badge text,
  source text,
  snapshot_at timestamptz not null,
  raw_data jsonb
);
create index if not exists leaderboard_history_lookup_idx on public.leaderboard_history (board_type, season, round, snapshot_at desc);
create index if not exists leaderboard_history_player_idx on public.leaderboard_history (player_name, board_type, snapshot_at desc);

create table if not exists public.clan_ranking_history (
  id bigint generated always as identity primary key,
  clan_id text not null,
  season text not null,
  rank integer not null,
  clan_name text not null,
  master text,
  member_current integer not null default 0,
  member_max integer not null default 0,
  reputation bigint not null default 0,
  source text,
  snapshot_at timestamptz not null,
  raw_data jsonb
);
create index if not exists clan_ranking_history_lookup_idx on public.clan_ranking_history (season, snapshot_at desc, rank);
create index if not exists clan_ranking_history_clan_idx on public.clan_ranking_history (clan_id, season, snapshot_at desc);

create table if not exists public.clan_members (
  clan_id text not null,
  season text not null,
  member_id text not null,
  name text not null,
  level integer not null default 0,
  reputation bigint not null default 0,
  stamina integer,
  max_stamina integer,
  title text,
  badge text,
  source text,
  captured_at timestamptz not null,
  raw_data jsonb,
  primary key (clan_id, season, member_id)
);
create index if not exists clan_members_name_idx on public.clan_members (name);
create index if not exists clan_members_clan_idx on public.clan_members (clan_id, season);

create table if not exists public.clan_member_events (
  id bigint generated always as identity primary key,
  clan_id text not null,
  season text not null,
  member_id text not null,
  member_name text not null,
  event_type text not null check (event_type in ('joined','left','updated')),
  occurred_at timestamptz not null,
  previous_data jsonb,
  current_data jsonb
);
create index if not exists clan_member_events_clan_idx on public.clan_member_events (clan_id, season, occurred_at desc);
create index if not exists clan_member_events_member_idx on public.clan_member_events (member_id, occurred_at desc);

alter table public.leaderboard_entries enable row level security;
alter table public.leaderboard_history enable row level security;
alter table public.clan_ranking_history enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_member_events enable row level security;

drop policy if exists "public read leaderboard entries" on public.leaderboard_entries;
create policy "public read leaderboard entries" on public.leaderboard_entries for select to anon using (true);
drop policy if exists "public read leaderboard history" on public.leaderboard_history;
create policy "public read leaderboard history" on public.leaderboard_history for select to anon using (true);
drop policy if exists "public read clan ranking history" on public.clan_ranking_history;
create policy "public read clan ranking history" on public.clan_ranking_history for select to anon using (true);
drop policy if exists "public read clan members" on public.clan_members;
create policy "public read clan members" on public.clan_members for select to anon using (true);
drop policy if exists "public read clan member events" on public.clan_member_events;
create policy "public read clan member events" on public.clan_member_events for select to anon using (true);

grant select on public.leaderboard_entries to anon;
grant select on public.leaderboard_history to anon;
grant select on public.clan_ranking_history to anon;
grant select on public.clan_members to anon;
grant select on public.clan_member_events to anon; 
