// Env-driven config. Fails fast on missing required secrets so a misconfigured
// deploy crashes loudly instead of silently doing nothing.

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

function seconds(name: string, defSeconds: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return (Number.isFinite(n) && n > 0 ? n : defSeconds) * 1000;
}

function optional(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

export const config = {
  appUrl: required('APP_URL').replace(/\/+$/, ''),
  workerSecret: required('WORKER_SECRET'),
  metaApiToken: required('METAAPI_TOKEN'),
  // cTrader is optional: when these are unset the worker simply skips cTrader
  // watching (MetaTrader keeps working). Same app credentials as the web app.
  ctraderClientId: optional('CTRADER_CLIENT_ID'),
  ctraderClientSecret: optional('CTRADER_CLIENT_SECRET'),
  pollIntervalMs: seconds('POLL_INTERVAL_SECONDS', 12),
  refreshAccountsMs: seconds('REFRESH_ACCOUNTS_SECONDS', 120),
  modifyCooldownMs: seconds('MODIFY_COOLDOWN_SECONDS', 300),
  newsSweepMs: seconds('NEWS_SWEEP_SECONDS', 60),
};
