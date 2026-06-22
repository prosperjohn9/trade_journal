// cTrader Open API client for the worker. cTrader is Protobuf-over-TLS-socket
// (no REST), so we hold one long-lived, app-authenticated socket per environment
// (live/demo) and account-auth every guarded account on it. The socket is used to
//   - reconcile open positions (poll, mirrors the MetaApi position poller), and
//   - assemble the live market context for a read (trendbars, symbol spec, spot
//     spread, balance, dollar risk to the stop) that the app's brain narrates.
// We never send trade-execution messages; this is read-only.

import * as tls from 'node:tls';
import { readFileSync } from 'node:fs';
import protobuf from 'protobufjs';
import { log } from './log';

const descriptor = JSON.parse(
  readFileSync(new URL('./ctrader.json', import.meta.url), 'utf8'),
) as protobuf.INamespace;
const root = protobuf.Root.fromJSON(descriptor);
const ProtoMessage = root.lookupType('ProtoMessage');

const PT = {
  HEARTBEAT: 51,
  APP_AUTH_REQ: 2100,
  ACCOUNT_AUTH_REQ: 2102,
  ASSET_LIST_REQ: 2112,
  SYMBOL_BY_ID_REQ: 2116,
  TRADER_REQ: 2121,
  RECONCILE_REQ: 2124,
  SUBSCRIBE_SPOTS_REQ: 2127,
  SPOT_EVENT: 2131,
  DEAL_LIST_REQ: 2133,
  GET_TRENDBARS_REQ: 2137,
  ERROR_RES: 2142,
  SYMBOLS_LIST_REQ: 2114,
} as const;

const HOSTS = { live: 'live.ctraderapi.com', demo: 'demo.ctraderapi.com' } as const;
const PORT = 5035;
const PRICE_SCALE = 100_000; // cTrader relative price scale (1/100000)

// Trendbar period ids and their minutes-per-bar.
const PERIOD = { H1: 9, H4: 10 } as const;
const PERIOD_MINUTES: Record<number, number> = { 5: 5, 7: 15, 8: 30, 9: 60, 10: 240, 12: 1440 };

export type CtraderEnv = 'live' | 'demo';

export type CtraderGuardAccount = {
  connectionId: string;
  accountId: string;
  ctidTraderAccountId: number;
  environment: CtraderEnv;
  userId: string;
  accessToken: string;
  // The trader's real timeframes (label + cTrader period); defaults H1/H4.
  timeframes?: Array<{ label: string; period: number }>;
};

export type CtraderPosition = {
  positionId: string;
  symbolId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number; // cents
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type Candle = { o: number; h: number; l: number; c: number };

export type MarketContext = {
  balance: number | null;
  currency: string | null;
  pipSize: number | null;
  spreadNow: number | null;
  riskMoney: number | null;
  timeframes: Array<{ tf: string; candles: Candle[] }>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  if (v && typeof v === 'object') {
    const o = v as { toNumber?: () => number; low?: number; high?: number };
    if (typeof o.toNumber === 'function') return o.toNumber();
    if (typeof o.low === 'number' && typeof o.high === 'number') {
      return o.high * 4294967296 + (o.low >>> 0);
    }
  }
  return Number(v ?? 0);
}

type Pending = { resolve: (b: Uint8Array) => void; reject: (e: Error) => void };

/** One long-lived, app-authenticated socket for a single environment, shared by
 *  every guarded account in that environment. */
class EnvSocket {
  private socket: tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private readonly pending = new Map<string, Pending>();
  private seq = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private readonly authed = new Set<number>();
  private readonly subscribed = new Set<string>(); // `${ctid}:${symbolId}`
  private readonly spots = new Map<string, { bid?: number; ask?: number }>();

  constructor(
    private readonly env: CtraderEnv,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private reset(e: Error): void {
    this.connected = false;
    this.authed.clear();
    this.subscribed.clear();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
    this.socket = null;
  }

  async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      await this.open();
      await this.request('ProtoOAApplicationAuthReq', PT.APP_AUTH_REQ, {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      });
      this.connected = true;
      this.heartbeat = setInterval(() => {
        try {
          this.writeMessage(PT.HEARTBEAT);
        } catch {
          /* ignore */
        }
      }, 10_000);
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const host = HOSTS[this.env];
      const socket = tls.connect({ host, port: PORT, servername: host }, () =>
        resolve(),
      );
      socket.setTimeout(30_000);
      socket.on('data', (d) => this.onData(d));
      socket.on('error', (e) => {
        this.reset(e);
        reject(e);
      });
      socket.on('timeout', () => {
        const e = new Error('cTrader socket timed out');
        this.reset(e);
        socket.destroy();
      });
      socket.on('close', () => this.reset(new Error('cTrader socket closed')));
      this.socket = socket;
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + len) break;
      const frame = this.buffer.subarray(4, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      this.onFrame(frame);
    }
  }

  private onFrame(frame: Buffer): void {
    const msg = ProtoMessage.decode(frame) as unknown as {
      payloadType: number;
      payload?: Uint8Array;
      clientMsgId?: string;
    };
    if (msg.payloadType === PT.HEARTBEAT) return;
    if (msg.payloadType === PT.SPOT_EVENT) {
      this.onSpot(msg.payload ?? new Uint8Array());
      return;
    }
    const pend = msg.clientMsgId ? this.pending.get(msg.clientMsgId) : undefined;
    if (!pend) return;
    this.pending.delete(msg.clientMsgId as string);
    const payload = msg.payload ?? new Uint8Array();
    if (msg.payloadType === PT.ERROR_RES) {
      const ErrorRes = root.lookupType('ProtoOAErrorRes');
      const e = ErrorRes.decode(payload) as unknown as {
        errorCode: string;
        description?: string;
      };
      pend.reject(new Error(`cTrader ${e.errorCode}: ${e.description ?? ''}`));
      return;
    }
    pend.resolve(payload);
  }

  private onSpot(payload: Uint8Array): void {
    const Ev = root.lookupType('ProtoOASpotEvent');
    const e = Ev.decode(payload) as unknown as {
      ctidTraderAccountId: unknown;
      symbolId: unknown;
      bid?: unknown;
      ask?: unknown;
    };
    const key = `${toNum(e.ctidTraderAccountId)}:${toNum(e.symbolId)}`;
    const cur = this.spots.get(key) ?? {};
    if (e.bid != null) cur.bid = toNum(e.bid);
    if (e.ask != null) cur.ask = toNum(e.ask);
    this.spots.set(key, cur);
  }

  private writeMessage(payloadType: number, payload?: Uint8Array): string {
    const clientMsgId = `m${++this.seq}`;
    const wrapper = ProtoMessage.encode(
      ProtoMessage.create({ payloadType, payload, clientMsgId }),
    ).finish();
    const framed = Buffer.alloc(4 + wrapper.length);
    framed.writeUInt32BE(wrapper.length, 0);
    Buffer.from(wrapper).copy(framed, 4);
    if (!this.socket) throw new Error('cTrader socket not connected');
    this.socket.write(framed);
    return clientMsgId;
  }

  private request(
    reqType: string,
    payloadType: number,
    body: Record<string, unknown>,
    timeoutMs = 15_000,
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const Req = root.lookupType(reqType);
      const inner = Req.encode(Req.create(body)).finish();
      let id: string;
      try {
        id = this.writeMessage(payloadType, inner);
      } catch (e) {
        return reject(e as Error);
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cTrader ${reqType} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (b) => {
          clearTimeout(timer);
          resolve(b);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  async authAccount(ctid: number, token: string): Promise<void> {
    await this.ensureConnected();
    if (this.authed.has(ctid)) return;
    await this.request('ProtoOAAccountAuthReq', PT.ACCOUNT_AUTH_REQ, {
      ctidTraderAccountId: ctid,
      accessToken: token,
    });
    this.authed.add(ctid);
  }

  async reconcile(ctid: number): Promise<CtraderPosition[]> {
    const bytes = await this.request('ProtoOAReconcileReq', PT.RECONCILE_REQ, {
      ctidTraderAccountId: ctid,
    });
    const Res = root.lookupType('ProtoOAReconcileRes');
    const res = Res.decode(bytes) as unknown as {
      position?: Array<Record<string, unknown>>;
    };
    return (res.position ?? [])
      .filter((p) => toNum(p.positionStatus) === 1)
      .map((p) => {
        const td = (p.tradeData ?? {}) as Record<string, unknown>;
        return {
          positionId: String(toNum(p.positionId)),
          symbolId: toNum(td.symbolId),
          symbol: '',
          side: toNum(td.tradeSide) === 2 ? ('SELL' as const) : ('BUY' as const),
          volume: toNum(td.volume),
          entry: typeof p.price === 'number' ? p.price : 0,
          stopLoss: typeof p.stopLoss === 'number' ? p.stopLoss : null,
          takeProfit: typeof p.takeProfit === 'number' ? p.takeProfit : null,
        };
      });
  }

  async symbolNames(ctid: number): Promise<Map<number, string>> {
    const bytes = await this.request('ProtoOASymbolsListReq', PT.SYMBOLS_LIST_REQ, {
      ctidTraderAccountId: ctid,
    });
    const Res = root.lookupType('ProtoOASymbolsListRes');
    const res = Res.decode(bytes) as unknown as {
      symbol?: Array<{ symbolId: unknown; symbolName?: string }>;
    };
    const map = new Map<number, string>();
    for (const s of res.symbol ?? [])
      map.set(toNum(s.symbolId), (s.symbolName ?? '').replace('/', '').toUpperCase());
    return map;
  }

  async symbolSpec(
    ctid: number,
    symbolId: number,
  ): Promise<{ digits: number; pipPosition: number; lotSize: number } | null> {
    const bytes = await this.request('ProtoOASymbolByIdReq', PT.SYMBOL_BY_ID_REQ, {
      ctidTraderAccountId: ctid,
      symbolId: [symbolId],
    });
    const Res = root.lookupType('ProtoOASymbolByIdRes');
    const res = Res.decode(bytes) as unknown as {
      symbol?: Array<{ digits: unknown; pipPosition: unknown; lotSize: unknown }>;
    };
    const s = (res.symbol ?? [])[0];
    if (!s) return null;
    return {
      digits: toNum(s.digits),
      pipPosition: toNum(s.pipPosition),
      lotSize: toNum(s.lotSize),
    };
  }

  async trendbars(
    ctid: number,
    symbolId: number,
    period: number,
    count: number,
  ): Promise<Candle[]> {
    const now = Date.now();
    const from = now - count * (PERIOD_MINUTES[period] ?? 60) * 60_000;
    const bytes = await this.request('ProtoOAGetTrendbarsReq', PT.GET_TRENDBARS_REQ, {
      ctidTraderAccountId: ctid,
      symbolId,
      period,
      count,
      fromTimestamp: from,
      toTimestamp: now,
    });
    const Res = root.lookupType('ProtoOAGetTrendbarsRes');
    const res = Res.decode(bytes) as unknown as {
      trendbar?: Array<Record<string, unknown>>;
    };
    return (res.trendbar ?? []).map((tb) => {
      const low = toNum(tb.low);
      return {
        o: (low + toNum(tb.deltaOpen)) / PRICE_SCALE,
        h: (low + toNum(tb.deltaHigh)) / PRICE_SCALE,
        l: low / PRICE_SCALE,
        c: (low + toNum(tb.deltaClose)) / PRICE_SCALE,
      };
    });
  }

  async trader(
    ctid: number,
  ): Promise<{ balance: number; depositAssetId: number; moneyDigits: number }> {
    const bytes = await this.request('ProtoOATraderReq', PT.TRADER_REQ, {
      ctidTraderAccountId: ctid,
    });
    const Res = root.lookupType('ProtoOATraderRes');
    const res = Res.decode(bytes) as unknown as {
      trader?: { balance: unknown; depositAssetId: unknown; moneyDigits?: unknown };
    };
    const t = res.trader ?? { balance: 0, depositAssetId: 0 };
    return {
      balance: toNum(t.balance),
      depositAssetId: toNum(t.depositAssetId),
      moneyDigits: toNum(t.moneyDigits),
    };
  }

  async assets(ctid: number): Promise<Map<number, string>> {
    const bytes = await this.request('ProtoOAAssetListReq', PT.ASSET_LIST_REQ, {
      ctidTraderAccountId: ctid,
    });
    const Res = root.lookupType('ProtoOAAssetListRes');
    const res = Res.decode(bytes) as unknown as {
      asset?: Array<{ assetId: unknown; name?: string }>;
    };
    const map = new Map<number, string>();
    for (const a of res.asset ?? []) map.set(toNum(a.assetId), a.name ?? '');
    return map;
  }

  async dealsPnl(ctid: number, positionId: string, fromMs: number): Promise<number> {
    const bytes = await this.request('ProtoOADealListReq', PT.DEAL_LIST_REQ, {
      ctidTraderAccountId: ctid,
      fromTimestamp: fromMs,
      toTimestamp: Date.now() + 60_000,
      maxRows: 200,
    });
    const Res = root.lookupType('ProtoOADealListRes');
    const res = Res.decode(bytes) as unknown as {
      deal?: Array<Record<string, unknown>>;
    };
    let pnl = 0;
    for (const d of res.deal ?? []) {
      if (String(toNum(d.positionId)) !== positionId) continue;
      const cp = d.closePositionDetail as Record<string, unknown> | undefined;
      if (!cp) continue;
      const scale = Math.pow(10, toNum(cp.moneyDigits) || 2);
      pnl +=
        (toNum(cp.grossProfit) + toNum(cp.swap) + toNum(cp.commission)) / scale;
    }
    return pnl;
  }

  /** Subscribe to a symbol's spot stream (idempotent) and wait for a full quote. */
  private async quote(
    ctid: number,
    symbolId: number,
  ): Promise<{ bid: number; ask: number } | null> {
    const key = `${ctid}:${symbolId}`;
    if (!this.subscribed.has(key)) {
      await this.request('ProtoOASubscribeSpotsReq', PT.SUBSCRIBE_SPOTS_REQ, {
        ctidTraderAccountId: ctid,
        symbolId: [symbolId],
      });
      this.subscribed.add(key);
    }
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const s = this.spots.get(key);
      if (s?.bid != null && s?.ask != null) return { bid: s.bid, ask: s.ask };
      await sleep(150);
    }
    const s = this.spots.get(key);
    return s?.bid != null && s?.ask != null ? { bid: s.bid, ask: s.ask } : null;
  }

  /** Current spread in price terms. */
  async spread(ctid: number, symbolId: number): Promise<number | null> {
    const q = await this.quote(ctid, symbolId);
    return q ? (q.ask - q.bid) / PRICE_SCALE : null;
  }

  /** Current mid price, used for currency conversion. */
  async midPrice(ctid: number, symbolId: number): Promise<number | null> {
    const q = await this.quote(ctid, symbolId);
    return q ? (q.bid + q.ask) / 2 / PRICE_SCALE : null;
  }
}

/** Manages one socket per environment plus cached per-account metadata, and
 *  exposes the high-level operations the worker loop needs. */
export class CtraderHub {
  private readonly sockets: Record<CtraderEnv, EnvSocket | null> = {
    live: null,
    demo: null,
  };
  private readonly names = new Map<number, Map<number, string>>(); // ctid -> symbolId -> name
  private readonly namesRev = new Map<number, Map<string, number>>(); // ctid -> name -> symbolId
  private readonly assetsByCtid = new Map<number, Map<number, string>>();
  // Symbol specs are broker-global, so cache per `${env}:${symbolId}`.
  private readonly specs = new Map<
    string,
    { digits: number; pipPosition: number; lotSize: number } | null
  >();

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private sock(env: CtraderEnv): EnvSocket {
    let s = this.sockets[env];
    if (!s) {
      s = new EnvSocket(env, this.clientId, this.clientSecret);
      this.sockets[env] = s;
    }
    return s;
  }

  private async getSpec(
    a: CtraderGuardAccount,
    symbolId: number,
  ): Promise<{ digits: number; pipPosition: number; lotSize: number } | null> {
    const key = `${a.environment}:${symbolId}`;
    if (this.specs.has(key)) return this.specs.get(key) ?? null;
    const s = this.sock(a.environment);
    await s.authAccount(a.ctidTraderAccountId, a.accessToken);
    const spec = await s.symbolSpec(a.ctidTraderAccountId, symbolId).catch(() => null);
    this.specs.set(key, spec);
    return spec;
  }

  /** Convert a position's cents volume to lots using the symbol's lot size. */
  async lots(a: CtraderGuardAccount, pos: CtraderPosition): Promise<number> {
    const spec = await this.getSpec(a, pos.symbolId);
    const lots =
      spec && spec.lotSize > 0 ? pos.volume / spec.lotSize : pos.volume / 10_000_000;
    return Math.round(lots * 100) / 100;
  }

  /** Symbol name maps (forward + reverse), fetched once per account and cached. */
  private async ensureNames(
    a: CtraderGuardAccount,
  ): Promise<Map<string, number>> {
    const cached = this.namesRev.get(a.ctidTraderAccountId);
    if (cached) return cached;
    const s = this.sock(a.environment);
    await s.authAccount(a.ctidTraderAccountId, a.accessToken);
    const fwd = await s.symbolNames(a.ctidTraderAccountId);
    const rev = new Map<string, number>();
    for (const [id, name] of fwd) rev.set(name, id);
    this.names.set(a.ctidTraderAccountId, fwd);
    this.namesRev.set(a.ctidTraderAccountId, rev);
    return rev;
  }

  /** Live rate to convert an amount in `from` currency into `to`, via whichever
   *  cross pair the broker lists (direct or inverted). null when neither exists. */
  private async conversionRate(
    a: CtraderGuardAccount,
    from: string,
    to: string,
  ): Promise<number | null> {
    if (from === to) return 1;
    const rev = await this.ensureNames(a).catch(() => null);
    if (!rev) return null;
    const s = this.sock(a.environment);

    const direct = rev.get(`${from}${to}`); // price = from->to
    if (direct != null) {
      const p = await s.midPrice(a.ctidTraderAccountId, direct).catch(() => null);
      if (p && p > 0) return p;
    }
    const inverse = rev.get(`${to}${from}`); // price = to->from, so invert
    if (inverse != null) {
      const p = await s.midPrice(a.ctidTraderAccountId, inverse).catch(() => null);
      if (p && p > 0) return 1 / p;
    }
    return null;
  }

  /** Reconcile open positions, resolving each symbol id to its name. */
  async positions(a: CtraderGuardAccount): Promise<CtraderPosition[]> {
    const s = this.sock(a.environment);
    await s.authAccount(a.ctidTraderAccountId, a.accessToken);
    const positions = await s.reconcile(a.ctidTraderAccountId);
    if (positions.length && !this.names.has(a.ctidTraderAccountId)) {
      try {
        await this.ensureNames(a);
      } catch (e) {
        log.warn('ctrader symbol names failed:', e);
      }
    }
    const nameMap = this.names.get(a.ctidTraderAccountId);
    for (const p of positions) p.symbol = nameMap?.get(p.symbolId) ?? `SYM${p.symbolId}`;
    return positions;
  }

  /** Assemble the live market context for a read. Each piece is best-effort; the
   *  app degrades gracefully when one is null. */
  async marketContext(
    a: CtraderGuardAccount,
    pos: CtraderPosition,
  ): Promise<MarketContext> {
    const s = this.sock(a.environment);
    await s.authAccount(a.ctidTraderAccountId, a.accessToken);

    // Read the trader's real timeframes (analysis + higher context); default to
    // the day-trader 1H + 4H when none are configured.
    const tfs =
      a.timeframes && a.timeframes.length
        ? a.timeframes
        : [
            { label: '1H', period: PERIOD.H1 },
            { label: '4H', period: PERIOD.H4 },
          ];
    const timeframes: MarketContext['timeframes'] = [];
    const series = await Promise.all(
      tfs.map((t) =>
        s.trendbars(a.ctidTraderAccountId, pos.symbolId, t.period, 120).catch(() => []),
      ),
    );
    tfs.forEach((t, i) => {
      if (series[i].length >= 6) timeframes.push({ tf: t.label, candles: series[i] });
    });

    let pipSize: number | null = null;
    const spec = await this.getSpec(a, pos.symbolId).catch(() => null);
    if (spec) pipSize = Math.pow(10, -spec.pipPosition);

    let spreadNow: number | null = null;
    try {
      spreadNow = await s.spread(a.ctidTraderAccountId, pos.symbolId);
    } catch {
      /* best-effort */
    }

    let balance: number | null = null;
    let currency: string | null = null;
    try {
      const t = await s.trader(a.ctidTraderAccountId);
      balance = t.balance / Math.pow(10, t.moneyDigits || 2);
      let assets = this.assetsByCtid.get(a.ctidTraderAccountId);
      if (!assets) {
        assets = await s.assets(a.ctidTraderAccountId);
        this.assetsByCtid.set(a.ctidTraderAccountId, assets);
      }
      currency = assets.get(t.depositAssetId) ?? null;
    } catch {
      /* best-effort */
    }

    // Dollar risk to the stop. risk(quote ccy) = |entry - SL| * units, where
    // units = volume/100. Converted into the deposit currency via a live cross
    // rate (rate = 1 when quote == deposit), so it works for cross pairs too.
    // Null only when no conversion pair exists (e.g. an exotic) or no stop.
    let riskMoney: number | null = null;
    const quoteCcy = pos.symbol.length >= 6 ? pos.symbol.slice(-3) : null;
    if (pos.stopLoss != null && currency && quoteCcy) {
      const riskQuote = Math.abs(pos.entry - pos.stopLoss) * (pos.volume / 100);
      const rate = await this.conversionRate(a, quoteCcy, currency).catch(
        () => null,
      );
      if (rate != null) riskMoney = Math.round(riskQuote * rate * 100) / 100;
    }

    return { balance, currency, pipSize, spreadNow, riskMoney, timeframes };
  }

  /** Realized P&L for a just-closed position, from its closing deal. */
  async closedPnl(a: CtraderGuardAccount, positionId: string): Promise<number> {
    const s = this.sock(a.environment);
    await s.authAccount(a.ctidTraderAccountId, a.accessToken);
    return s.dealsPnl(a.ctidTraderAccountId, positionId, Date.now() - 30 * 60_000);
  }
}
