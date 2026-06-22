-- Weekly Hindsight digest: every Monday 13:00 UTC, hit /api/cron/digest, which
-- computes each entitled user's last-7-days behavioural leaks and delivers the
-- digest to Telegram + email. Reuses the same vault cron_secret as the other
-- jobs. The endpoint itself decides who is due (opted in + traded this week).

select cron.schedule(
  'weekly-digest',
  '0 13 * * 1',
  $job$
  select net.http_post(
    url := 'https://tradershindsight.com/api/cron/digest',
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
