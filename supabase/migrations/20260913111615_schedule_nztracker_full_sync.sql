select cron.unschedule(jobid) from cron.job where jobname = 'nztracker-full-sync-5m';
select cron.schedule(
  'nztracker-full-sync-5m',
  '*/5 * * * *',
  $$select net.http_get(
      'https://nztracker.vercel.app/api/sync-all',
      headers := jsonb_build_object(
        'Accept', 'application/json',
        'User-Agent', 'SupabaseNinjaZenshinSync/1.0'
      ),
      timeout_milliseconds := 50000
  ) as request_id$$
);
