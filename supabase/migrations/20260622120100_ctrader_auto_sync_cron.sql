-- Schedule the cTrader auto-sync. Separate job from the MetaTrader sync because
-- the Open API socket flow needs its own 60s function budget. Runs every 6h; the
-- endpoint itself only refreshes users whose cTrader is past the daily window, so
-- the effective cadence is ~once per user per day. Reuses the same vault
-- cron_secret as the MetaTrader job. cTrader sync is free, so this never deploys
-- or bills anything; it just keeps connected accounts current.

select cron.schedule(
  'ctrader-auto-sync',
  '15 */6 * * *',
  $job$
  select net.http_post(
    url := 'https://tradershindsight.com/api/cron/ctrader',
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
