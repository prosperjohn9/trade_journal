// Foresight worker: the always-on half of Live Guard.
//
// Loop: keep every Foresight-enabled MetaTrader account deployed, poll its open
// positions, and react to changes.
//   - a new position  -> ask the app for a read (pushed to the trader's Telegram)
//   - a moved SL / TP  -> ask for a fresh read (rate-limited, to bound AI cost)
//   - a closed position -> tell the app to record the outcome and close the loop
//
// The worker itself is deliberately thin: no AI, no Telegram, no database. It
// holds only the MetaApi token (to watch accounts) and the worker secret (to
// call the app). All judgment lives in the app, reused verbatim.

import { config } from './config';
import { log } from './log';
import {
  getAccountStatus,
  deployAccount,
  undeployAccount,
  fetchOpenPositions,
  type OpenPosition,
} from './metaapi';
import {
  listGuardedAccounts,
  requestAnalyze,
  reportClose,
  reportNewsCheck,
  type GuardedAccount,
} from './app';

type PosSnapshot = {
  stopLoss: number | null;
  takeProfit: number | null;
  lastModifyAt: number;
};

type AccountState = {
  acc: GuardedAccount;
  // false until the first successful poll; lets us record what is already open
  // without firing alerts for trades that predate the worker.
  seeded: boolean;
  known: Map<string, PosSnapshot>;
  // Symbols currently open, refreshed each poll; fed to the news countdown.
  openSymbols: string[];
};

const accounts = new Map<string, AccountState>();
let lastRefresh = 0;
let lastNewsSweep = 0;
let stopping = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function approxEq(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

// Sync the watched set with the app: pick up newly enabled accounts, drop and
// undeploy ones that were turned off (or breached / over the cap).
async function refreshAccounts(): Promise<void> {
  const list = await listGuardedAccounts();
  const live = new Set(list.map((a) => a.connectionId));

  for (const a of list) {
    const existing = accounts.get(a.connectionId);
    if (existing) {
      existing.acc = a;
    } else {
      accounts.set(a.connectionId, {
        acc: a,
        seeded: false,
        known: new Map(),
        openSymbols: [],
      });
      log.info(`now guarding account ${a.metaApiAccountId} (${a.region})`);
    }
  }

  for (const [id, st] of accounts) {
    if (!live.has(id)) {
      accounts.delete(id);
      log.info(`stopped guarding ${st.acc.metaApiAccountId}; undeploying`);
      try {
        await undeployAccount(st.acc.metaApiAccountId);
      } catch (e) {
        log.warn(`undeploy ${st.acc.metaApiAccountId} failed:`, e);
      }
    }
  }

  log.info(`watching ${accounts.size} guarded account(s)`);
}

// Make sure the account is deployed and connected. Returns true only when it is
// ready to be polled this tick; otherwise it kicks off a deploy and waits.
async function ensureReady(st: AccountState): Promise<boolean> {
  const status = await getAccountStatus(st.acc.metaApiAccountId);
  if (status.state === 'DEPLOYED' && status.connectionStatus === 'CONNECTED') {
    return true;
  }
  if (status.state !== 'DEPLOYED' && status.state !== 'DEPLOYING') {
    log.info(`deploying ${st.acc.metaApiAccountId} (was ${status.state})`);
    await deployAccount(st.acc.metaApiAccountId);
  }
  return false;
}

async function tickAccount(st: AccountState): Promise<void> {
  let ready: boolean;
  try {
    ready = await ensureReady(st);
  } catch (e) {
    log.warn(`status/deploy ${st.acc.metaApiAccountId} failed:`, e);
    return;
  }
  if (!ready) return;

  let positions: OpenPosition[];
  try {
    positions = await fetchOpenPositions(st.acc.metaApiAccountId, st.acc.region);
  } catch (e) {
    log.warn(`positions ${st.acc.metaApiAccountId} failed:`, e);
    return;
  }
  const current = new Map(positions.map((p) => [p.id, p]));
  st.openSymbols = [...new Set(positions.map((p) => p.symbol))];

  // First successful read after (re)start: remember what is already open without
  // alerting, so we only fire on trades opened from here on.
  if (!st.seeded) {
    for (const p of positions) {
      st.known.set(p.id, {
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        lastModifyAt: 0,
      });
    }
    st.seeded = true;
    log.info(
      `seeded ${st.acc.metaApiAccountId} with ${positions.length} open position(s)`,
    );
    return;
  }

  // Opens and modifies.
  for (const p of positions) {
    const prev = st.known.get(p.id);
    if (!prev) {
      st.known.set(p.id, {
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        lastModifyAt: 0,
      });
      log.info(`OPEN ${p.symbol} ${p.side} on ${st.acc.metaApiAccountId}`);
      try {
        await requestAnalyze(st.acc.connectionId, p.id, 'open');
      } catch (e) {
        log.warn('analyze(open) failed:', e);
      }
      continue;
    }
    const changed =
      !approxEq(prev.stopLoss, p.stopLoss) ||
      !approxEq(prev.takeProfit, p.takeProfit);
    if (changed) {
      prev.stopLoss = p.stopLoss;
      prev.takeProfit = p.takeProfit;
      const now = Date.now();
      if (now - prev.lastModifyAt >= config.modifyCooldownMs) {
        prev.lastModifyAt = now;
        log.info(`MODIFY ${p.symbol} on ${st.acc.metaApiAccountId}`);
        try {
          await requestAnalyze(st.acc.connectionId, p.id, 'modify');
        } catch (e) {
          log.warn('analyze(modify) failed:', e);
        }
      } else {
        log.info(`MODIFY ${p.symbol} within cooldown; not re-analyzing`);
      }
    }
  }

  // Closes.
  for (const id of [...st.known.keys()]) {
    if (!current.has(id)) {
      st.known.delete(id);
      log.info(`CLOSE position ${id} on ${st.acc.metaApiAccountId}`);
      try {
        await reportClose(st.acc.connectionId, id);
      } catch (e) {
        log.warn('close failed:', e);
      }
    }
  }
}

async function tick(): Promise<void> {
  if (Date.now() - lastRefresh >= config.refreshAccountsMs) {
    try {
      await refreshAccounts();
      lastRefresh = Date.now();
    } catch (e) {
      log.warn('refresh accounts failed:', e);
    }
  }
  for (const st of accounts.values()) {
    if (stopping) break;
    await tickAccount(st);
  }

  // In-trade news countdown, on a slower cadence than position polling: tell the
  // app which symbols are open so it can ping when high-impact news nears one.
  if (Date.now() - lastNewsSweep >= config.newsSweepMs) {
    lastNewsSweep = Date.now();
    for (const st of accounts.values()) {
      if (stopping) break;
      if (!st.seeded || st.openSymbols.length === 0) continue;
      try {
        await reportNewsCheck(st.acc.connectionId, st.openSymbols);
      } catch (e) {
        log.warn('news check failed:', e);
      }
    }
  }
}

async function main(): Promise<void> {
  log.info('Foresight worker starting', {
    appUrl: config.appUrl,
    pollMs: config.pollIntervalMs,
  });
  try {
    await refreshAccounts();
  } catch (e) {
    log.warn('initial refresh failed (will retry):', e);
  }
  lastRefresh = Date.now();

  while (!stopping) {
    const start = Date.now();
    try {
      await tick();
    } catch (e) {
      log.error('tick error:', e);
    }
    const elapsed = Date.now() - start;
    await sleep(Math.max(1000, config.pollIntervalMs - elapsed));
  }
  log.info('worker stopped (guarded accounts left deployed)');
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    log.info(`${sig} received; shutting down after this tick`);
    stopping = true;
  });
}

main().catch((e) => {
  log.error('fatal:', e);
  process.exit(1);
});
