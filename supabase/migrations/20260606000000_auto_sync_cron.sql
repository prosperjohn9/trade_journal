-- Schedules MetaTrader auto-sync. Every 30 minutes pg_cron calls the
-- /api/cron/sync endpoint (via pg_net); the endpoint syncs each connection past
-- its owner's plan interval. Auth uses a shared secret in Vault, mirrored in the
-- app's CRON_SECRET env var.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Generate the shared secret once (kept in Vault, revealed to set CRON_SECRET).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'cron_secret',
      'Shared secret for the /api/cron/sync endpoint'
    );
  end if;
end $$;

-- (Re)schedule the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'metatrader-auto-sync') then
    perform cron.unschedule('metatrader-auto-sync');
  end if;
end $$;

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
    body := '{}'::jsonb
  );
  $job$
);
