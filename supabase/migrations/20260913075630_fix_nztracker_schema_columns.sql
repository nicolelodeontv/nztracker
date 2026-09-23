alter table public.clan_rankings add column if not exists clan text;
alter table public.clan_rankings add column if not exists member_current integer default 0;
alter table public.clan_rankings add column if not exists member_max integer default 0;
alter table public.clan_rankings add column if not exists source text;
alter table public.clan_rankings add column if not exists captured_at timestamptz;

update public.clan_rankings set clan = clan_name where clan is null;
update public.clan_rankings set member_current = coalesce(members, 0) where member_current is null;
update public.clan_rankings set captured_at = fetched_at where captured_at is null;

alter table public.sync_runs add column if not exists season integer;
alter table public.sync_runs add column if not exists clans_seen integer default 0;
alter table public.sync_runs add column if not exists finished_at timestamptz;

create index if not exists sync_runs_finished_at_idx on public.sync_runs (finished_at desc); 
