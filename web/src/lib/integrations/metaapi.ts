// MetaApi integration — read-only sync of MetaTrader 4/5 trade history.
//
// Talks to MetaApi's REST API directly (no SDK) so it stays light and runs in
// any Node route handler. The single app token lives in METAAPI_TOKEN. Users'
// investor passwords are passed to MetaApi at connect time and never stored by
// us — we keep only the MetaApi account id.

import { randomUUID } from 'node:crypto';

export const DEFAULT_MT_REGION = 'london';

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

/** Turn a failed MetaApi/MetaStats response into a clean, user-safe Error. The
 *  raw provider body (often an HTML 5xx page) is logged server-side for
 *  debugging but never surfaced to the client. */
async function metaApiError(context: string, res: Response): Promise<Error> {
  const raw = await res.text().catch(() => '');
  console.error(`[metaapi] ${context} failed: ${res.status} ${raw.slice(0, 500)}`);
  const message =
    res.status === 400
      ? 'The broker login, server, or investor password was not accepted. Please double-check them and try again.'
      : res.status === 401 || res.status === 403
        ? 'Broker authorization failed. Please reconnect the account.'
        : res.status === 404
          ? 'That broker account was not found on the sync service.'
          : res.status === 429
            ? 'Too many sync requests right now. Please wait a moment and try again.'
            : res.status >= 500
              ? 'The broker data service is busy right now. Please try again in a minute.'
              : 'Broker sync is temporarily unavailable. Please try again shortly.';
  return new Error(message);
}

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

/** Provision a read-only MetaApi account for a user's MT login. Trade history is
 *  read later from the account's raw deal history (no MetaStats). The investor
 *  password is sent to MetaApi once here and never stored by us. */
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
    }),
  });

  if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
    throw await metaApiError('provisioning', res);
  }

  const data = (await res.json()) as { id?: string; state?: string };
  if (!data?.id) throw new Error('MetaApi did not return an account id');
  return { metaApiAccountId: data.id, state: data.state ?? 'DRAFT', region };
}

/** Remove a MetaApi account entirely, which stops all metering. Trades already
 *  imported into our DB are unaffected. A 404 means it's already gone. */
export async function removeMetaApiAccount(
  metaApiAccountId: string,
): Promise<void> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}`,
    { method: 'DELETE', headers: { 'auth-token': getMetaApiToken() } },
  );
  if (![200, 202, 204, 404].includes(res.status)) {
    throw await metaApiError('account removal', res);
  }
}

const TRADE_DEAL_TYPES = new Set(['DEAL_TYPE_BUY', 'DEAL_TYPE_SELL']);

export type BalanceEventRow = {
  user_id: string;
  account_id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  occurred_at: string;
  source: string;
  external_id: string;
};

// === Deploy-on-demand lifecycle + raw deal history (replaces MetaStats) ========

// Region-specific client API host (account data + history live here).
function clientApiHost(region: string): string {
  return `https://mt-client-api-v1.${region}.agiliumtrade.ai`;
}

export type AccountStatus = { state: string; connectionStatus: string };

/** Read an account's deployment state and broker-connection status. */
export async function getAccountStatus(
  metaApiAccountId: string,
): Promise<AccountStatus> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}`,
    { headers: { 'auth-token': getMetaApiToken() }, cache: 'no-store' },
  );
  if (!res.ok) throw await metaApiError('account read', res);
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
export async function deployAccount(metaApiAccountId: string): Promise<void> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}/deploy`,
    { method: 'POST', headers: { 'auth-token': getMetaApiToken() } },
  );
  if (![200, 201, 202, 204].includes(res.status)) {
    throw await metaApiError('deploy', res);
  }
}

/** Stop the account (ends ongoing hosting; the 6-hour minimum deploy fee still
 *  applies). Core of deploy-on-demand cost control. */
export async function undeployAccount(metaApiAccountId: string): Promise<void> {
  const res = await fetch(
    `${PROVISIONING_HOST}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}/undeploy`,
    { method: 'POST', headers: { 'auth-token': getMetaApiToken() } },
  );
  if (![200, 201, 202, 204].includes(res.status)) {
    throw await metaApiError('undeploy', res);
  }
}

/** Poll until the account is connected to the broker (history is then readable),
 *  or until the time budget runs out. Returns true if it connected in time. */
export async function waitUntilConnected(
  metaApiAccountId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 35_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { connectionStatus } = await getAccountStatus(metaApiAccountId);
    if (connectionStatus === 'CONNECTED') return true;
    if (Date.now() + intervalMs >= deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** A raw MetaTrader deal from the (free) MetaApi client REST API. */
export type MetatraderDeal = {
  id: string;
  type: string; // DEAL_TYPE_BUY | DEAL_TYPE_SELL | DEAL_TYPE_BALANCE | ...
  entryType?: string; // DEAL_ENTRY_IN | DEAL_ENTRY_OUT | DEAL_ENTRY_INOUT | DEAL_ENTRY_OUT_BY
  positionId?: string;
  orderId?: string;
  symbol?: string;
  volume?: number;
  price?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  time?: string; // ISO 8601 (UTC)
  comment?: string;
};

/** Fetch raw historical deals for a DEPLOYED + CONNECTED account. Free on MetaApi
 *  (no MetaStats fee). */
export async function fetchHistoricalDeals(params: {
  metaApiAccountId: string;
  region: string;
  from: Date;
  to: Date;
}): Promise<MetatraderDeal[]> {
  const { metaApiAccountId, region, from, to } = params;
  const url =
    `${clientApiHost(region)}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}` +
    `/history-deals/time/${encodeURIComponent(from.toISOString())}/${encodeURIComponent(to.toISOString())}`;

  let res = await fetch(url, {
    headers: { 'auth-token': getMetaApiToken() },
    cache: 'no-store',
  });
  for (
    let attempt = 0;
    attempt < 2 && [502, 503, 504].includes(res.status);
    attempt++
  ) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    res = await fetch(url, {
      headers: { 'auth-token': getMetaApiToken() },
      cache: 'no-store',
    });
  }
  if (!res.ok) throw await metaApiError('history-deals', res);

  const body = (await res.json()) as
    | MetatraderDeal[]
    | { deals?: MetatraderDeal[] };
  return Array.isArray(body) ? body : (body.deals ?? []);
}

// === Live (open-position) reads for the Live Guard analyzer ====================
// All require a DEPLOYED + CONNECTED account (deploy-on-demand by the caller).

export type OpenPosition = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  openPrice: number;
  currentPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  volume: number;
};

async function clientGet(
  region: string,
  metaApiAccountId: string,
  path: string,
  context: string,
): Promise<unknown> {
  const url = `${clientApiHost(region)}/users/current/accounts/${encodeURIComponent(metaApiAccountId)}${path}`;
  const res = await fetch(url, {
    headers: { 'auth-token': getMetaApiToken() },
    cache: 'no-store',
  });
  if (res.status === 404) return null; // e.g. no such position / symbol not subscribed
  if (!res.ok) throw await metaApiError(context, res);
  return res.json();
}

/** Open positions on the account right now. */
export async function fetchOpenPositions(
  metaApiAccountId: string,
  region: string,
): Promise<OpenPosition[]> {
  const body = (await clientGet(region, metaApiAccountId, '/positions', 'positions')) as
    | Array<Record<string, unknown>>
    | null;
  if (!Array.isArray(body)) return [];
  return body.map((p) => ({
    id: String(p.id ?? ''),
    symbol: String(p.symbol ?? '').toUpperCase(),
    side: p.type === 'POSITION_TYPE_SELL' ? 'SELL' : 'BUY',
    openPrice: Number(p.openPrice ?? 0),
    currentPrice: num(p.currentPrice as number | undefined),
    stopLoss: num(p.stopLoss as number | undefined),
    takeProfit: num(p.takeProfit as number | undefined),
    volume: Number(p.volume ?? 0),
  }));
}

export type SymbolPrice = {
  bid: number | null;
  ask: number | null;
  /** Value of one tick of loss per lot, in account currency (for risk sizing). */
  lossTickValue: number | null;
};

/** Live price + tick value for a symbol. spread = ask - bid. */
export async function fetchSymbolPrice(
  metaApiAccountId: string,
  region: string,
  symbol: string,
): Promise<SymbolPrice | null> {
  const body = (await clientGet(
    region,
    metaApiAccountId,
    `/symbols/${encodeURIComponent(symbol)}/current-price?keepSubscription=false`,
    'symbol price',
  )) as Record<string, unknown> | null;
  if (!body) return null;
  return {
    bid: num(body.bid as number | undefined),
    ask: num(body.ask as number | undefined),
    lossTickValue: num(body.lossTickValue as number | undefined),
  };
}

/** Tick size for a symbol (to turn a stop distance into ticks). */
export async function fetchTickSize(
  metaApiAccountId: string,
  region: string,
  symbol: string,
): Promise<number | null> {
  const body = (await clientGet(
    region,
    metaApiAccountId,
    `/symbols/${encodeURIComponent(symbol)}/specification`,
    'symbol spec',
  )) as Record<string, unknown> | null;
  return body ? num(body.tickSize as number | undefined) : null;
}

export type LiveCandle = { o: number; h: number; l: number; c: number };

/** Recent OHLC candles for a symbol, oldest to newest. */
export async function fetchCandles(
  metaApiAccountId: string,
  region: string,
  symbol: string,
  timeframe = '1h',
  limit = 100,
): Promise<LiveCandle[]> {
  const body = (await clientGet(
    region,
    metaApiAccountId,
    `/historical-market-data/symbols/${encodeURIComponent(symbol)}/timeframes/${encodeURIComponent(timeframe)}/candles?limit=${limit}`,
    'candles',
  )) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(body)) return [];
  return body
    .map((k) => ({
      o: Number(k.open ?? 0),
      h: Number(k.high ?? 0),
      l: Number(k.low ?? 0),
      c: Number(k.close ?? 0),
    }))
    .filter((k) => k.h > 0 && k.l > 0);
}

export type AccountInfo = { balance: number | null; currency: string | null };

/** Account balance + currency. */
export async function fetchAccountInformation(
  metaApiAccountId: string,
  region: string,
): Promise<AccountInfo | null> {
  const body = (await clientGet(
    region,
    metaApiAccountId,
    '/account-information',
    'account info',
  )) as Record<string, unknown> | null;
  if (!body) return null;
  return {
    balance: num(body.balance as number | undefined),
    currency: typeof body.currency === 'string' ? body.currency : null,
  };
}

/** Volume-weighted average price of a set of deals. */
function vwap(deals: MetatraderDeal[]): number | null {
  let vol = 0;
  let pxVol = 0;
  for (const d of deals) {
    const v = num(d.volume);
    const p = num(d.price);
    if (v == null || p == null || v <= 0) continue;
    vol += v;
    pxVol += p * v;
  }
  return vol > 0 ? pxVol / vol : (num(deals[0]?.price) ?? null);
}

const IN_ENTRIES = new Set(['DEAL_ENTRY_IN', 'DEAL_ENTRY_INOUT']);
const OUT_ENTRIES = new Set([
  'DEAL_ENTRY_OUT',
  'DEAL_ENTRY_OUT_BY',
  'DEAL_ENTRY_INOUT',
]);

/** Pair raw deals into round-trip trades and extract balance ops, the in-house
 *  replacement for MetaStats. external_id stays `metaapi:{positionId}` so trades
 *  previously imported via MetaStats dedup cleanly. pnl_percent is derived from a
 *  running account balance (approximates MetaStats' "gain"). */
export function buildFromDeals(
  deals: MetatraderDeal[],
  ctx: {
    userId: string;
    accountId: string;
    fallbackStartingBalance?: number | null;
  },
): {
  initialBalance: number | null;
  balanceEvents: BalanceEventRow[];
  trades: ImportedTradeRow[];
} {
  // 1) Balance operations -> starting balance + deposit/withdrawal events.
  const balanceDeals = deals
    .filter((d) => d.type === 'DEAL_TYPE_BALANCE' && d.time)
    .sort((a, b) => ((a.time ?? '') < (b.time ?? '') ? -1 : 1));

  let initialBalance: number | null = null;
  const balanceEvents: BalanceEventRow[] = [];
  if (balanceDeals.length) {
    const [first, ...rest] = balanceDeals;
    initialBalance =
      typeof first.profit === 'number' &&
      Number.isFinite(first.profit) &&
      first.profit > 0
        ? first.profit
        : null;
    for (const op of rest) {
      const amount = num(op.profit);
      if (amount == null || amount === 0 || !op.time) continue;
      balanceEvents.push({
        user_id: ctx.userId,
        account_id: ctx.accountId,
        kind: amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: Math.abs(amount),
        occurred_at: op.time,
        source: 'metaapi',
        external_id: `metaapi:${op.id}`,
      });
    }
  }

  // 2) Group trade deals by position.
  const byPosition = new Map<string, MetatraderDeal[]>();
  for (const d of deals) {
    if (!TRADE_DEAL_TYPES.has(d.type)) continue;
    if (!d.positionId || !d.symbol) continue;
    const arr = byPosition.get(d.positionId);
    if (arr) arr.push(d);
    else byPosition.set(d.positionId, [d]);
  }

  // 3) Build one trade per CLOSED position.
  type Pending = { row: ImportedTradeRow; net: number; closedMs: number };
  const pending: Pending[] = [];
  for (const [positionId, group] of byPosition) {
    group.sort((a, b) => ((a.time ?? '') < (b.time ?? '') ? -1 : 1));
    const ins = group.filter((d) => IN_ENTRIES.has(d.entryType ?? 'DEAL_ENTRY_IN'));
    const outs = group.filter((d) => OUT_ENTRIES.has(d.entryType ?? ''));
    if (!ins.length || !outs.length) continue; // not a closed round-trip yet

    const openDeal = ins[0];
    const opened_at = openDeal.time ?? null;
    if (!opened_at) continue;
    const closed_at = outs[outs.length - 1].time ?? null;

    const grossProfit = group.reduce((s, d) => s + (num(d.profit) ?? 0), 0);
    const commission = group.reduce((s, d) => s + (num(d.commission) ?? 0), 0);
    const swap = group.reduce((s, d) => s + (num(d.swap) ?? 0), 0);
    const net = grossProfit + commission + swap;

    pending.push({
      net,
      closedMs: new Date(closed_at ?? opened_at).getTime(),
      row: {
        user_id: ctx.userId,
        account_id: ctx.accountId,
        external_id: `metaapi:${positionId}`,
        import_source: 'metaapi',
        instrument: (openDeal.symbol ?? '').toUpperCase(),
        direction: openDeal.type === 'DEAL_TYPE_SELL' ? 'SELL' : 'BUY',
        outcome: net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN',
        opened_at,
        closed_at,
        entry_price: vwap(ins),
        exit_price: vwap(outs),
        stop_loss: parseLevel(openDeal.comment, 'sl'),
        take_profit: parseLevel(openDeal.comment, 'tp'),
        volume: ins.reduce((s, d) => s + (num(d.volume) ?? 0), 0) || null,
        pnl_amount: grossProfit,
        pnl_percent: 0, // filled from the running balance below
        net_pnl: net,
        commission: -(commission + swap), // positive = net cost (so pnl - cost = net)
        risk_amount: null,
        r_multiple: null,
      },
    });
  }

  // 4) Running-balance pass for pnl_percent: walk balance ops + trades in time
  //    order, charging each trade's % against the balance just before it closed.
  type TimelineItem =
    | { ms: number; kind: 'balance'; signed: number }
    | { ms: number; kind: 'trade'; ref: Pending };
  const timeline: TimelineItem[] = [];
  for (const op of balanceDeals) {
    const amt = num(op.profit);
    if (amt == null || !op.time) continue;
    timeline.push({ ms: new Date(op.time).getTime(), kind: 'balance', signed: amt });
  }
  for (const p of pending) {
    timeline.push({ ms: p.closedMs, kind: 'trade', ref: p });
  }
  timeline.sort((a, b) => a.ms - b.ms);

  let balance = ctx.fallbackStartingBalance ?? 0;
  for (const item of timeline) {
    if (item.kind === 'balance') {
      balance += item.signed;
      continue;
    }
    if (balance > 0) {
      item.ref.row.pnl_percent = (item.ref.net / balance) * 100;
    }
    balance += item.ref.net;
  }

  return { initialBalance, balanceEvents, trades: pending.map((p) => p.row) };
}
