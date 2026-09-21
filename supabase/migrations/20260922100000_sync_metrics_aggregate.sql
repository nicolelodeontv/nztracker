create or replace function public.rep_tracker_sync_metrics_today(
  p_clan_id text,
  p_season text,
  p_since timestamptz
)
returns table(
  success_count bigint,
  failed_count bigint,
  avg_duration_ms numeric,
  slow_syncs bigint,
  roster_changes bigint,
  amf_count bigint,
  legacy_count bigint
)
language sql
stable
as $$
  select
    count(*) filter (where status = 'success') as success_count,
    count(*) filter (where status <> 'success') as failed_count,
    coalesce(avg(duration_ms) filter (where status = 'success'), 0) as avg_duration_ms,
    count(*) filter (where status = 'success' and duration_ms > 5000) as slow_syncs,
    count(*) filter (
      where nullif(details->>'rosterChange', '') is not null
    ) as roster_changes,
    count(*) filter (
      where details->>'memberSource' = 'amf'
    ) as amf_count,
    count(*) filter (
      where details->>'memberSource' = 'legacy'
    ) as legacy_count
  from public.rep_tracker_sync_runs
  where clan_id = p_clan_id
    and season = p_season
    and started_at >= p_since;
$$;

revoke all on function public.rep_tracker_sync_metrics_today(text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.rep_tracker_sync_metrics_today(text, text, timestamptz)
  to service_role;
