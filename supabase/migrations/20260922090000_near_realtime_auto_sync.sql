do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'nztracker-full-sync-5m'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'nztracker-full-sync-5m',
    '10 seconds',
    $cron$
      select net.http_get(
        'https://chaoszenshintracker.vercel.app/api/monitor',
        headers := jsonb_build_object(
          'Accept', 'application/json',
          'User-Agent', 'SupabaseNinjaZenshinMonitor/1.0',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nztracker_cron_secret')
        ),
        timeout_milliseconds := 50000
      ) as request_id
    $cron$
  );
end $$;

update public.rep_tracker_config
set sync_interval_seconds = 10,
    updated_at = now()
where id = 'main';
