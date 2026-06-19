// Client for the app's worker-only endpoints. The shared WORKER_SECRET
// authenticates every call; the app does all the privileged work (Supabase, AI,
// Telegram) so the worker never holds those credentials.

import { config } from './config';

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-worker-secret': config.workerSecret,
  };
}

export type GuardedAccount = {
  connectionId: string;
  accountId: string;
  metaApiAccountId: string;
  region: string;
  userId: string;
};

/** The MetaTrader accounts with Foresight enabled that the worker should watch. */
export async function listGuardedAccounts(): Promise<GuardedAccount[]> {
  const res = await fetch(`${config.appUrl}/api/guard/accounts`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`list accounts ${res.status}`);
  const body = (await res.json()) as { accounts?: GuardedAccount[] };
  return body.accounts ?? [];
}

/** Ask the app to analyze a position and push the read to the owner's Telegram. */
export async function requestAnalyze(
  connectionId: string,
  positionId: string,
  trigger: 'open' | 'modify',
): Promise<void> {
  const res = await fetch(`${config.appUrl}/api/guard/analyze`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ connectionId, positionId, trigger }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`analyze ${res.status} ${t.slice(0, 200)}`);
  }
}

/** Tell the app a guarded position closed, so it can record the outcome. */
export async function reportClose(
  connectionId: string,
  positionId: string,
): Promise<void> {
  const res = await fetch(`${config.appUrl}/api/guard/close`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ connectionId, positionId }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`close ${res.status} ${t.slice(0, 200)}`);
  }
}

/** Report the symbols open on a guarded account so the app can ping Telegram
 *  when high-impact news nears one of them. The app decides + delivers + dedupes. */
export async function reportNewsCheck(
  connectionId: string,
  symbols: string[],
): Promise<void> {
  const res = await fetch(`${config.appUrl}/api/guard/news`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ connectionId, symbols }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`news ${res.status} ${t.slice(0, 200)}`);
  }
}
