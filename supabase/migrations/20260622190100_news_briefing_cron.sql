-- Daily Telegram news briefing: every day 06:30 UTC, hit /api/cron/news-briefing,
-- which pushes today's high-impact events for each user's traded pairs. Reuses
-- the vault cron_secret. The endpoint stays silent on a clear day.

select cron.schedule(
  'news-briefing',
  '30 6 * * *',
  $job$
  select net.http_post(
    url := 'https://tradershindsight.com/api/cron/news-briefing',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
