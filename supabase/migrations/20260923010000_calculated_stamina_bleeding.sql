-- Calculated Stamina / Bleeding tracker.
-- This is tracker-derived state, not server-reported Ninja Zenshin Stamina.

alter table public.rep_tracker_member_latest
  add column if not exists stamina integer,
  add column if not exists max_stamina integer;

create table if not exists public.rep_tracker_stamina_state (
  clan_id text not null,
  season text not null,
  member_id text not null,
  stamina integer not null default 200,
  max_stamina integer not null default 200,
  last_rep bigint,
  last_recovery_at timestamptz not null,
  last_calculated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (clan_id, season, member_id),
  check (stamina >= 0),
  check (stamina <= max_stamina),
  check (max_stamina > 0)
);

create index if not exists rep_tracker_stamina_state_clan_season
  on public.rep_tracker_stamina_state (clan_id, season);

create or replace function public.advance_rep_tracker_stamina(
  p_clan_id text,
  p_season text,
  p_member_id text,
  p_current_rep bigint,
  p_captured_at timestamptz
)
returns table (
  clan_id text,
  season text,
  member_id text,
  stamina integer,
  max_stamina integer,
  previous_stamina integer,
  rep_gain bigint,
  drained integer,
  recovered integer,
  recovery_intervals integer,
  calculated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.rep_tracker_stamina_state%rowtype;
  captured_at timestamptz := coalesce(p_captured_at, now());
  intervals integer := 0;
  recovered_amount integer := 0;
  drain_amount integer := 0;
  next_stamina integer := 200;
  previous_rep_value bigint;
  rep_gain_value bigint := 0;
begin
  if coalesce(trim(p_clan_id), '') = ''
     or coalesce(trim(p_season), '') = ''
     or coalesce(trim(p_member_id), '') = '' then
    raise exception 'clan_id, season, and member_id are required';
  end if;

  select *
    into existing
    from public.rep_tracker_stamina_state
   where clan_id = p_clan_id
     and season = p_season
     and member_id = p_member_id
   for update;

  if not found then
    insert into public.rep_tracker_stamina_state (
      clan_id, season, member_id, stamina, max_stamina,
      last_rep, last_recovery_at, last_calculated_at, updated_at
    ) values (
      p_clan_id, p_season, p_member_id, 200, 200,
      p_current_rep, captured_at, captured_at, captured_at
    );

    return query
      select p_clan_id, p_season, p_member_id, 200, 200,
             200, 0::bigint, 0, 0, 0, captured_at;
    return;
  end if;

  previous_rep_value := existing.last_rep;

  if captured_at > existing.last_recovery_at then
    intervals := floor(extract(epoch from (captured_at - existing.last_recovery_at)) / 1800);
    intervals := greatest(0, intervals);
    recovered_amount := least(
      greatest(0, existing.max_stamina - existing.stamina),
      intervals * 60
    );
  end if;

  next_stamina := least(
    existing.max_stamina,
    greatest(0, existing.stamina + recovered_amount)
  );

  if previous_rep_value is not null and p_current_rep > previous_rep_value then
    rep_gain_value := p_current_rep - previous_rep_value;
    drain_amount := least(next_stamina, 10);
    next_stamina := next_stamina - drain_amount;
  end if;

  update public.rep_tracker_stamina_state
     set stamina = next_stamina,
         last_rep = p_current_rep,
         last_recovery_at = existing.last_recovery_at + make_interval(mins => intervals * 30),
         last_calculated_at = captured_at,
         updated_at = captured_at
   where clan_id = p_clan_id
     and season = p_season
     and member_id = p_member_id;

  return query
    select p_clan_id,
           p_season,
           p_member_id,
           next_stamina,
           existing.max_stamina,
           existing.stamina,
           rep_gain_value,
           drain_amount,
           recovered_amount,
           intervals,
           captured_at;
end;
$$;
