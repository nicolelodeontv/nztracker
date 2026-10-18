-- Finished-season clan war results. Global ranking snapshots already use
-- public.rep_tracker_ranking_history (see 20260921150223_canonical_ranking_history.sql).

create table if not exists public.clan_war_results (
  season     integer not null,
  rank       integer not null,
  clan_name  text    not null,
  members    integer,
  reputation bigint  not null,
  ended_on   date,
  primary key (season, rank)
);

alter table public.clan_war_results enable row level security;

drop policy if exists "public read results" on public.clan_war_results;
create policy "public read results"
  on public.clan_war_results
  for select
  to anon, authenticated
  using (true);

-- Public is read-only; all writes are performed by the server using its
-- Supabase secret/service-role credential.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.clan_war_results to anon, authenticated;
grant select, insert, update, delete on public.clan_war_results to service_role;
