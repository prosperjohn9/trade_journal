// cTrader Open API client over a TLS socket. The Open API is Protobuf-over-socket
// (no REST), so we open a short-lived TLS connection, run the read flow, and
// close. Serverless-friendly: one connection per sync, well within the function
// timeout. We only ever use the read path (app auth -> get accounts -> account
// auth -> symbols -> deals); we never send trade-execution messages.

import * as tls from 'node:tls';
import protobuf from 'protobufjs';
import descriptor from './ctrader-proto/ctrader.json';

const root = protobuf.Root.fromJSON(descriptor as protobuf.INamespace);
const ProtoMessage = root.lookupType('ProtoMessage');

// Payload type ids from OpenApiModelMessages.proto (verified against the spec).
const PT = {
  HEARTBEAT: 51,
  APP_AUTH_REQ: 2100,
  ACCOUNT_AUTH_REQ: 2102,
  ASSET_LIST_REQ: 2112,
  SYMBOLS_LIST_REQ: 2114,
  TRADER_REQ: 2121,
  DEAL_LIST_REQ: 2133,
  ERROR_RES: 2142,
  GET_ACCOUNTS_REQ: 2149,
} as const;

const HOSTS = {
  live: 'live.ctraderapi.com',
  demo: 'demo.ctraderapi.com',
} as const;
const PORT = 5035;

export type CtraderEnv = 'live' | 'demo';

export type CtraderAccount = {
  ctidTraderAccountId: number;
  isLive: boolean;
  traderLogin: number;
  brokerTitleShort: string;
};

export type CtraderDeal = {
  dealId: number;
  positionId: number;
  symbolId: number;
  volume: number;
  filledVolume: number;
  executionTimestamp: number; // ms
  executionPrice: number;
  tradeSide: 'BUY' | 'SELL';
  commission: number; // raw, scaled by 10^moneyDigits
  moneyDigits: number;
  close: {
    entryPrice: number;
    grossProfit: number; // raw
    swap: number; // raw
    commission: number; // raw
    balance: number; // raw
    closedVolume: number;
    moneyDigits: number;
  } | null;
};

/** protobufjs returns 64-bit ints as number, string, or a Long {low,high}. */
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

type Pending = {
  resolve: (payload: Uint8Array) => void;
  reject: (e: Error) => void;
};

/** A single short-lived cTrader Open API session. */
export class CtraderSession {
  private socket: tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private readonly pending = new Map<string, Pending>();
  private seq = 0;
  private closed = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly environment: CtraderEnv) {}

  connect(timeoutMs = 20_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const host = HOSTS[this.environment];
      const socket = tls.connect({ host, port: PORT, servername: host }, () => {
        // Keep the connection alive during longer syncs.
        this.heartbeat = setInterval(() => this.sendHeartbeat(), 10_000);
        resolve();
      });
      socket.setTimeout(timeoutMs);
      socket.on('data', (d) => this.onData(d));
      socket.on('error', (e) => {
        this.failAll(e);
        reject(e);
      });
      socket.on('timeout', () => {
        const e = new Error('cTrader socket timed out');
        this.failAll(e);
        socket.destroy();
        reject(e);
      });
      socket.on('close', () => {
        if (!this.closed) this.failAll(new Error('cTrader socket closed'));
      });
      this.socket = socket;
    });
  }

  close(): void {
    this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.destroy();
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Frames are a 4-byte big-endian length prefix followed by a ProtoMessage.
    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + len) break;
      const frame = this.buffer.subarray(4, 4 + len);
      this.buffer = this.buffer.subarray(4 + len);
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: Buffer): void {
    const msg = ProtoMessage.decode(frame) as unknown as {
      payloadType: number;
      payload?: Uint8Array;
      clientMsgId?: string;
    };
    if (msg.payloadType === PT.HEARTBEAT) return;
    const pend = msg.clientMsgId ? this.pending.get(msg.clientMsgId) : undefined;
    if (!pend) return; // unsolicited event; ignore
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

  private failAll(e: Error): void {
    for (const p of this.pending.values()) p.reject(e);
    this.pending.clear();
  }

  private writeMessage(payloadType: number, payload?: Uint8Array): string {
    const clientMsgId = `m${++this.seq}`;
    const wrapper = ProtoMessage.encode(
      ProtoMessage.create({ payloadType, payload, clientMsgId }),
    ).finish();
    const framed = Buffer.alloc(4 + wrapper.length);
    framed.writeUInt32BE(wrapper.length, 0);
    Buffer.from(wrapper).copy(framed, 4);
    this.socket?.write(framed);
    return clientMsgId;
  }

  private sendHeartbeat(): void {
    if (!this.socket || this.closed) return;
    this.writeMessage(PT.HEARTBEAT);
  }

  /** Send a request and resolve with the response's inner payload bytes. */
  private request(
    reqType: string,
    payloadType: number,
    body: Record<string, unknown>,
  ): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('cTrader socket not connected'));
      const Req = root.lookupType(reqType);
      const inner = Req.encode(Req.create(body)).finish();
      const clientMsgId = this.writeMessage(payloadType, inner);
      this.pending.set(clientMsgId, { resolve, reject });
    });
  }

  async appAuth(clientId: string, clientSecret: string): Promise<void> {
    await this.request('ProtoOAApplicationAuthReq', PT.APP_AUTH_REQ, {
      clientId,
      clientSecret,
    });
  }

  async getAccounts(accessToken: string): Promise<CtraderAccount[]> {
    const bytes = await this.request(
      'ProtoOAGetAccountListByAccessTokenReq',
      PT.GET_ACCOUNTS_REQ,
      { accessToken },
    );
    const Res = root.lookupType('ProtoOAGetAccountListByAccessTokenRes');
    const res = Res.decode(bytes) as unknown as {
      ctidTraderAccount?: Array<{
        ctidTraderAccountId: unknown;
        isLive?: boolean;
        traderLogin?: unknown;
        brokerTitleShort?: string;
      }>;
    };
    return (res.ctidTraderAccount ?? []).map((a) => ({
      ctidTraderAccountId: toNum(a.ctidTraderAccountId),
      isLive: Boolean(a.isLive),
      traderLogin: toNum(a.traderLogin),
      brokerTitleShort: a.brokerTitleShort ?? '',
    }));
  }

  async accountAuth(
    ctidTraderAccountId: number,
    accessToken: string,
  ): Promise<void> {
    await this.request('ProtoOAAccountAuthReq', PT.ACCOUNT_AUTH_REQ, {
      ctidTraderAccountId,
      accessToken,
    });
  }

  /** Trader account: current balance + deposit currency (asset id) + money exponent. */
  async getTrader(
    ctidTraderAccountId: number,
  ): Promise<{ balance: number; depositAssetId: number; moneyDigits: number }> {
    const bytes = await this.request('ProtoOATraderReq', PT.TRADER_REQ, {
      ctidTraderAccountId,
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

  /** Asset id -> currency code (e.g. EUR, USD). */
  async getAssets(ctidTraderAccountId: number): Promise<Map<number, string>> {
    const bytes = await this.request('ProtoOAAssetListReq', PT.ASSET_LIST_REQ, {
      ctidTraderAccountId,
    });
    const Res = root.lookupType('ProtoOAAssetListRes');
    const res = Res.decode(bytes) as unknown as {
      asset?: Array<{ assetId: unknown; name?: string }>;
    };
    const map = new Map<number, string>();
    for (const a of res.asset ?? []) map.set(toNum(a.assetId), a.name ?? '');
    return map;
  }

  async getSymbols(ctidTraderAccountId: number): Promise<Map<number, string>> {
    const bytes = await this.request('ProtoOASymbolsListReq', PT.SYMBOLS_LIST_REQ, {
      ctidTraderAccountId,
    });
    const Res = root.lookupType('ProtoOASymbolsListRes');
    const res = Res.decode(bytes) as unknown as {
      symbol?: Array<{ symbolId: unknown; symbolName?: string }>;
    };
    const map = new Map<number, string>();
    for (const s of res.symbol ?? []) {
      map.set(toNum(s.symbolId), (s.symbolName ?? '').replace('/', '').toUpperCase());
    }
    return map;
  }

  async getDeals(
    ctidTraderAccountId: number,
    fromMs: number,
    toMs: number,
    maxRows = 1000,
  ): Promise<CtraderDeal[]> {
    const bytes = await this.request('ProtoOADealListReq', PT.DEAL_LIST_REQ, {
      ctidTraderAccountId,
      fromTimestamp: fromMs,
      toTimestamp: toMs,
      maxRows,
    });
    const Res = root.lookupType('ProtoOADealListRes');
    const res = Res.decode(bytes) as unknown as {
      deal?: Array<Record<string, unknown>>;
    };
    return (res.deal ?? []).map((d) => {
      const cp = d.closePositionDetail as Record<string, unknown> | undefined;
      return {
        dealId: toNum(d.dealId),
        positionId: toNum(d.positionId),
        symbolId: toNum(d.symbolId),
        volume: toNum(d.volume),
        filledVolume: toNum(d.filledVolume),
        executionTimestamp: toNum(d.executionTimestamp),
        executionPrice:
          typeof d.executionPrice === 'number' ? d.executionPrice : 0,
        tradeSide: d.tradeSide === 2 || d.tradeSide === 'SELL' ? 'SELL' : 'BUY',
        commission: toNum(d.commission),
        moneyDigits: toNum(d.moneyDigits),
        close: cp
          ? {
              entryPrice: typeof cp.entryPrice === 'number' ? cp.entryPrice : 0,
              grossProfit: toNum(cp.grossProfit),
              swap: toNum(cp.swap),
              commission: toNum(cp.commission),
              balance: toNum(cp.balance),
              closedVolume: toNum(cp.closedVolume),
              moneyDigits: toNum(cp.moneyDigits),
            }
          : null,
      };
    });
  }
}
