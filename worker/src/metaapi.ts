// Thin MetaApi REST client. The worker only needs the "watch" half: keep guarded
// accounts deployed and read their open positions. All analysis, AI, Telegram,
// and database writes happen in the app, which the worker calls back into. This
// mirrors the app's own REST patterns (no SDK) so behavior stays identical.

import { config } from './config';

const PROVISIONING_HOST =
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

function clientApiHost(region: string): string {
  return `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
}

function authHeaders(): Record<string, string> {
  return { 'auth-token': config.metaApiToken };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export type AccountStatus = { state: string; connectionStatus: string };

/** Deployment state + broker-connection status for an account. */
export async function getAccountStatus(id: string): Promise<AccountStatus> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(id)}`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`account status ${res.status}`);
  const data = (await res.json()) as {
    state?: string;
    connectionStatus?: string;
  };
  return {
    state: data.state ?? 'UNKNOWN',
    connectionStatus: data.connectionStatus ?? 'DISCONNECTED',
  };
}

/** Start the account (begins metered hosting). Idempotent on MetaApi's side. */
export async function deployAccount(id: string): Promise<void> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(id)}/deploy`,
    { method: 'POST', headers: authHeaders() },
  );
  if (![200, 201, 202, 204].includes(res.status)) {
    throw new Error(`deploy ${res.status}`);
  }
}

/** Stop the account (ends ongoing hosting). Used when Foresight is turned off. */
export async function undeployAccount(id: string): Promise<void> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(id)}/undeploy`,
    { method: 'POST', headers: authHeaders() },
  );
  if (![200, 201, 202, 204].includes(res.status)) {
    throw new Error(`undeploy ${res.status}`);
  }
}

export type OpenPosition = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  stopLoss: number | null;
  takeProfit: number | null;
};

/** Open positions on a DEPLOYED + CONNECTED account. */
export async function fetchOpenPositions(
  id: string,
  region: string,
): Promise<OpenPosition[]> {
  const res = await fetch(
    `${clientApiHost(region)}/users/current/accounts/${encodeURIComponent(id)}/positions`,
    { headers: authHeaders() },
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`positions ${res.status}`);
  const body = (await res.json()) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(body)) return [];
  return body.map((p) => ({
    id: String(p.id ?? ''),
    symbol: String(p.symbol ?? '').toUpperCase(),
    side: p.type === 'POSITION_TYPE_SELL' ? 'SELL' : 'BUY',
    stopLoss: num(p.stopLoss),
    takeProfit: num(p.takeProfit),
  }));
}
