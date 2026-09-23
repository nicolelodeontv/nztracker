select cron.unschedule('nztracker-full-sync-5m');
select cron.schedule(
  'nztracker-full-sync-5m',
  '*/5 * * * *',
  $$select net.http_get(
      'https://chaoszenshintracker.vercel.app/api/sync-all',
      headers := jsonb_build_object(
        'Accept', 'application/json',
        'User-Agent', 'SupabaseNinjaZenshinSync/1.1'
      ),
      timeout_milliseconds := 50000
  ) as request_id$$
);
