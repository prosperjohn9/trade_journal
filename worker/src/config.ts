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

export const config = {
  appUrl: required('APP_URL').replace(/\/+$/, ''),
  workerSecret: required('WORKER_SECRET'),
  metaApiToken: required('METAAPI_TOKEN'),
  pollIntervalMs: seconds('POLL_INTERVAL_SECONDS', 12),
  refreshAccountsMs: seconds('REFRESH_ACCOUNTS_SECONDS', 120),
  modifyCooldownMs: seconds('MODIFY_COOLDOWN_SECONDS', 300),
  newsSweepMs: seconds('NEWS_SWEEP_SECONDS', 60),
};
