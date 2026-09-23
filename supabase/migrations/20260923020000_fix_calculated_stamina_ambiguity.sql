-- Fix calculated Stamina RPC output-column ambiguity.
-- The original function used output names clan_id/season/member_id and then
-- referenced those bare names in WHERE clauses, which PostgreSQL reports as
-- ambiguous (42702). Qualify all table-column references with an alias.

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

  select t.*
    into existing
    from public.rep_tracker_stamina_state as t
   where t.clan_id = p_clan_id
     and t.season = p_season
     and t.member_id = p_member_id
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

  update public.rep_tracker_stamina_state as t
     set stamina = next_stamina,
         last_rep = p_current_rep,
         last_recovery_at = existing.last_recovery_at + make_interval(mins => intervals * 30),
         last_calculated_at = captured_at,
         updated_at = captured_at
   where t.clan_id = p_clan_id
     and t.season = p_season
     and t.member_id = p_member_id;

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

revoke all on function public.advance_rep_tracker_stamina(text, text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.advance_rep_tracker_stamina(text, text, text, bigint, timestamptz) to service_role;
