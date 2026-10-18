-- Clan war tracking: ranking snapshots + finished-season results

create table if not exists public.clan_snapshots (
  id            bigint generated always as identity primary key,
  captured_at   timestamptz not null default now(),
  content_hash  text not null,
  season_closed boolean not null default false
);
create index if not exists clan_snapshots_captured_idx on public.clan_snapshots (captured_at desc);

create table if not exists public.clan_snapshot_rows (
  snapshot_id bigint not null references public.clan_snapshots(id) on delete cascade,
  rank        int    not null,
  clan_name   text   not null,
  master      text,
  members     int,
  member_cap  int,
  reputation  bigint not null,
  primary key (snapshot_id, rank)
);
create index if not exists clan_snapshot_rows_clan_idx on public.clan_snapshot_rows (clan_name, snapshot_id);

create table if not exists public.clan_war_results (
  season     int    not null,
  rank       int    not null,
  clan_name  text   not null,
  members    int,
  reputation bigint not null,
  ended_on   date,
  primary key (season, rank)
);

-- Atomic insert; returns {inserted:false} when nothing changed since the last snapshot
create or replace function public.insert_clan_snapshot(p_hash text, p_closed boolean, p_rows jsonb)
returns jsonb
language plpgsql
as $$
declare
  last_hash text;
  new_id    bigint;
begin
  select content_hash into last_hash
  from public.clan_snapshots
  order by captured_at desc, id desc
  limit 1;

  if last_hash is not distinct from p_hash then
    return jsonb_build_object('inserted', false);
  end if;

  insert into public.clan_snapshots (content_hash, season_closed)
  values (p_hash, p_closed)
  returning id into new_id;

  insert into public.clan_snapshot_rows (snapshot_id, rank, clan_name, master, members, member_cap, reputation)
  select new_id,
         (r->>'rank')::int,
         r->>'clan_name',
         r->>'master',
         (r->>'members')::int,
         (r->>'member_cap')::int,
         (r->>'reputation')::bigint
  from jsonb_array_elements(p_rows) r;

  return jsonb_build_object('inserted', true, 'snapshot_id', new_id);
end;
$$;

revoke execute on function public.insert_clan_snapshot(text, boolean, jsonb) from public, anon, authenticated;
grant  execute on function public.insert_clan_snapshot(text, boolean, jsonb) to service_role;

-- Latest standings with 24h gain and rank movement (null until 24h of history exists)
create or replace view public.clan_latest_with_delta
with (security_invoker = true) as
with latest as (
  select id, captured_at from public.clan_snapshots order by captured_at desc, id desc limit 1
),
prev as (
  select s.id
  from public.clan_snapshots s, latest l
  where s.captured_at <= l.captured_at - interval '24 hours'
  order by s.captured_at desc
  limit 1
)
select r.rank, r.clan_name, r.master, r.members, r.member_cap, r.reputation,
       r.reputation - p.reputation as gain_24h,
       p.rank - r.rank             as rank_change_24h,
       l.captured_at
from latest l
join public.clan_snapshot_rows r on r.snapshot_id = l.id
left join prev on true
left join public.clan_snapshot_rows p on p.snapshot_id = prev.id and p.clan_name = r.clan_name;

-- Public game data: readable by the site, written only by the service role
alter table public.clan_snapshots     enable row level security;
alter table public.clan_snapshot_rows enable row level security;
alter table public.clan_war_results   enable row level security;

drop policy if exists "public read snapshots" on public.clan_snapshots;
drop policy if exists "public read rows" on public.clan_snapshot_rows;
drop policy if exists "public read results" on public.clan_war_results;

create policy "public read snapshots" on public.clan_snapshots     for select to anon, authenticated using (true);
create policy "public read rows"      on public.clan_snapshot_rows for select to anon, authenticated using (true);
create policy "public read results"   on public.clan_war_results   for select to anon, authenticated using (true);

-- RLS controls row visibility; GRANT is separately required for Data API access.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.clan_snapshots, public.clan_snapshot_rows, public.clan_war_results
  to anon, authenticated;
grant select, insert, update, delete on public.clan_snapshots, public.clan_snapshot_rows, public.clan_war_results
  to service_role;
grant select on public.clan_latest_with_delta to anon, authenticated, service_role;
