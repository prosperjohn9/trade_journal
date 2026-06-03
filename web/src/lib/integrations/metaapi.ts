// MetaApi integration — read-only sync of MetaTrader 4/5 trade history.
//
// Talks to MetaApi's REST API directly (no SDK) so it stays light and runs in
// any Node route handler. The single app token lives in METAAPI_TOKEN. Users'
// investor passwords are passed to MetaApi at connect time and never stored by
// us — we keep only the MetaApi account id.

import { randomUUID } from 'node:crypto';

export const DEFAULT_MT_REGION = 'london';

function metaStatsHost(region: string): string {
  return `https://metastats-api-v1.${region}.agiliumtrade.ai`;
}

// Region-agnostic provisioning host (empirically verified — the doubled
// "agiliumtrade" is MetaApi's real base domain, not a typo).
const PROVISIONING_HOST =
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

export type MtPlatform = 'mt4' | 'mt5';

export function getMetaApiToken(): string {
  const token = process.env.METAAPI_TOKEN;
  if (!token) throw new Error('METAAPI_TOKEN is not configured');
  return token;
}

/** A historical (closed, already-paired) trade from the MetaStats API. */
export type MetaStatsTrade = {
  _id: string;
  accountId: string;
  positionId?: string;
  symbol?: string;
  type: string; // DEAL_TYPE_BUY | DEAL_TYPE_SELL | DEAL_TYPE_BALANCE | ...
  volume?: number;
  openTime?: string; // "YYYY-MM-DD HH:mm:ss.SSS", broker time
  closeTime?: string;
  openPrice?: number;
  closePrice?: number;
  profit?: number;
  gain?: number;
  pips?: number;
  success?: string; // 'won' | 'lost'
  comment?: string;
  durationInMinutes?: number;
};

/** Row shape inserted into public.trades for an imported trade. */
export type ImportedTradeRow = {
  user_id: string;
  account_id: string;
  external_id: string;
  import_source: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  opened_at: string;
  closed_at: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  volume: number | null;
  pnl_amount: number;
  pnl_percent: number;
  net_pnl: number;
  commission: number;
  risk_amount: number | null;
  r_multiple: number | null;
};

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Format a Date as the MetaStats path param "YYYY-MM-DD HH:mm:ss.SSS". */
function formatRange(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
  );
}

/** Broker time "YYYY-MM-DD HH:mm:ss.SSS" -> ISO string. Treated as UTC for now;
 *  per-broker timezone is a later refinement (affects session analytics only). */
function brokerTimeToIso(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function num(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Pull a "[sl 1.2345]" / "[tp 1.2345]" level out of the broker comment. */
function parseLevel(comment: string | undefined, key: 'sl' | 'tp'): number | null {
  if (!comment) return null;
  const match = comment.match(new RegExp(`\\[${key}\\s+([\\d.]+)\\]`, 'i'));
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** Fetch paired historical trades from MetaStats for a connected account. */
export async function fetchHistoricalTrades(params: {
  metaApiAccountId: string;
  region: string;
  from: Date;
  to: Date;
  updateHistory?: boolean;
}): Promise<MetaStatsTrade[]> {
  const { metaApiAccountId, region, from, to, updateHistory = true } = params;
  const url =
    `${metaStatsHost(region)}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}` +
    `/historical-trades/${encodeURIComponent(formatRange(from))}/${encodeURIComponent(formatRange(to))}` +
    `?updateHistory=${updateHistory ? 'true' : 'false'}`;

  const res = await fetch(url, {
    headers: { 'auth-token': getMetaApiToken() },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MetaStats request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const body = (await res.json()) as { trades?: MetaStatsTrade[] };
  return Array.isArray(body.trades) ? body.trades : [];
}

/** Provision a read-only MetaApi account for a user's MT login. MetaStats is
 *  enabled at creation so trade history is available without an extra step. The
 *  investor password is sent to MetaApi once here and never stored by us. */
export async function provisionAccount(params: {
  name: string;
  login: string;
  password: string;
  server: string;
  platform: MtPlatform;
  region?: string;
  reliability?: 'regular' | 'high';
}): Promise<{ metaApiAccountId: string; state: string; region: string }> {
  const region = params.region ?? DEFAULT_MT_REGION;
  const res = await fetch(`${PROVISIONING_HOST}/users/current/accounts`, {
    method: 'POST',
    headers: {
      'auth-token': getMetaApiToken(),
      'transaction-id': randomUUID().replace(/-/g, ''),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      login: params.login,
      password: params.password,
      server: params.server,
      platform: params.platform,
      magic: 0,
      type: 'cloud-g2',
      region,
      reliability: params.reliability ?? 'high',
      metastatsApiEnabled: true,
    }),
  });

  if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `MetaApi provisioning failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { id?: string; state?: string };
  if (!data?.id) throw new Error('MetaApi did not return an account id');
  return { metaApiAccountId: data.id, state: data.state ?? 'DRAFT', region };
}

const TRADE_DEAL_TYPES = new Set(['DEAL_TYPE_BUY', 'DEAL_TYPE_SELL']);

/** Map a MetaStats trade to a trades-table row, or null if it isn't a real,
 *  importable trade (balance/credit operations, or missing essentials). */
export function mapTradeToRow(
  trade: MetaStatsTrade,
  ctx: { userId: string; accountId: string },
): ImportedTradeRow | null {
  if (!TRADE_DEAL_TYPES.has(trade.type)) return null; // skip balance/credit ops
  if (!trade.positionId || !trade.symbol) return null;

  const opened_at = brokerTimeToIso(trade.openTime);
  if (!opened_at) return null; // opened_at is NOT NULL

  const profit = num(trade.profit) ?? 0;
  const outcome: ImportedTradeRow['outcome'] =
    profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAKEVEN';

  return {
    user_id: ctx.userId,
    account_id: ctx.accountId,
    external_id: `metaapi:${trade.positionId}`,
    import_source: 'metaapi',
    instrument: trade.symbol.toUpperCase(),
    direction: trade.type === 'DEAL_TYPE_BUY' ? 'BUY' : 'SELL',
    outcome,
    opened_at,
    closed_at: brokerTimeToIso(trade.closeTime),
    entry_price: num(trade.openPrice),
    exit_price: num(trade.closePrice),
    stop_loss: parseLevel(trade.comment, 'sl'),
    take_profit: parseLevel(trade.comment, 'tp'),
    volume: num(trade.volume),
    pnl_amount: profit,
    pnl_percent: num(trade.gain) ?? 0,
    net_pnl: profit,
    commission: 0,
    risk_amount: null,
    r_multiple: null,
  };
}
