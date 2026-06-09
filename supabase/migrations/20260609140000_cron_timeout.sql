-- The auto-sync endpoint runs deploy-on-demand (deploy, poll, fetch, undeploy),
-- which can take far longer than pg_net's default 5s wait. Re-schedule the job
-- with a 55s pg_net timeout so the worker keeps the connection open for the full
-- sync and records the real response instead of a spurious timeout.

select cron.schedule(
  'metatrader-auto-sync',
  '*/30 * * * *',
  $job$
  select net.http_post(
    url := 'https://trade-journal-beta.vercel.app/api/cron/sync',
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
