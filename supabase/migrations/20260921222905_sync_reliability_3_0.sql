alter table public.rep_tracker_sync_runs
  add column if not exists duration_ms integer;

create index if not exists rep_tracker_sync_runs_lookup
  on public.rep_tracker_sync_runs (clan_id, season, started_at desc);

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'nztracker-monitor-http-health-1m'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'nztracker-monitor-http-health-1m',
    '* * * * *',
    $cron$
      with latest as (
        select
          id,
          status_code,
          timed_out,
          error_msg,
          created,
          headers->>'x-vercel-id' as vercel_id,
          headers->>'x-matched-path' as matched_path
        from net._http_response
        where created > now() - interval '5 minutes'
          and headers->>'x-matched-path' = '/api/monitor'
        order by created desc
        limit 1
      ),
      recent as (
        select
          count(*) as request_count,
          count(*) filter (
            where status_code between 200 and 299
              and timed_out = false
              and error_msg is null
          ) as success_count,
          count(*) filter (
            where status_code >= 400
              or status_code is null
              or timed_out = true
              or error_msg is not null
          ) as failure_count
        from net._http_response
        where created > now() - interval '5 minutes'
          and headers->>'x-matched-path' = '/api/monitor'
      )
      insert into public.rep_tracker_kv (key, value, updated_at)
      select
        'monitor:http-latest',
        jsonb_build_object(
          'requestId', latest.id,
          'statusCode', latest.status_code,
          'timedOut', latest.timed_out,
          'errorMsg', latest.error_msg,
          'created', latest.created,
          'vercelId', latest.vercel_id,
          'matchedPath', latest.matched_path,
          'recent5m', jsonb_build_object(
            'requests', recent.request_count,
            'successes', recent.success_count,
            'failures', recent.failure_count
          ),
          'checkedAt', now()
        ),
        now()
      from latest
      cross join recent
      on conflict (key) do update
      set value = excluded.value,
          updated_at = excluded.updated_at
    $cron$
  );
end $$;
