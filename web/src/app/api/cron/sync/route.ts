import { NextResponse } from 'next/server';
import { createServiceClient } from '@/src/lib/supabase/admin';
import {
  syncConnection,
  logRefresh,
  enforceSyncCaps,
  type SyncConnection,
} from '@/src/lib/integrations/sync';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';
import { reconcileAddons } from '@/src/lib/billing/addons';
import { adminUserIdSet } from '@/src/lib/auth/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/cron/sync
//
// Scheduled by Supabase pg_cron (every 30 min via pg_net). Each run syncs a few
// "due" MetaTrader accounts via deploy-on-demand (deploy, fetch, undeploy),
// oldest-due first. Auto-sync is once daily per account; accounts with no recent
// trades drop to weekly so we never pay to deploy dormant accounts. Failing or
// mid-connect accounts are backed off. Not entitled = skipped. Auth: CRON_SECRET.

const DAILY_HOURS = 24;
const IDLE_HOURS = 24 * 7; // dormant accounts (no recent trades) sync weekly
const IDLE_TRADE_DAYS = 14; // no trade closed within this window => dormant
const BACKOFF_HOURS = 1; // don't retry a failing / connecting account sooner
const MAX_PER_RUN = 3; // bound the run against the 60s function limit

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get('authorization') ??
    request.headers.get('x-cron-secret');
  return header === secret || header === `Bearer ${secret}`;
}

type DueConnection = SyncConnection & {
  user_id: string;
  last_synced_at: string | null;
  state: string | null;
  updated_at: string | null;
};

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Expire any lapsed one-period add-ons and re-sync extra account slots before
  // we decide who is due. Cheap and best-effort; never block the sync run on it.
  await reconcileAddons(admin).catch(() => {});

  // Then suspend any MetaTrader accounts now over the user's (possibly reduced)
  // synced-account cap, so a lapsed add-on or downgrade stops costing us money.
  await enforceSyncCaps(admin).catch(() => {});

  const [{ data: connections }, { data: subs }] = await Promise.all([
    admin
      .from('mt_connections')
      .select(
        'id, account_id, metaapi_account_id, region, last_synced_at, created_at, state, updated_at, user_id, guard_enabled',
      ),
    admin.from('subscriptions').select(`user_id, ${SUBSCRIPTION_SELECT}`),
  ]);

  const entitledUsers = new Set<string>();
  for (const s of (subs ?? []) as Array<SubscriptionRow & { user_id: string }>) {
    if (resolveEntitlements(s).entitled) entitledUsers.add(s.user_id);
  }
  // The owner/admin auto-syncs (deploy-on-demand, normal cost) regardless of
  // subscription. This never makes an account always-deployed.
  for (const id of await adminUserIdSet(admin)) entitledUsers.add(id);

  const conns = ((connections ?? []) as DueConnection[]).filter((c) =>
    entitledUsers.has(c.user_id),
  );

  // Accounts that traded recently keep the daily cadence; the rest go weekly so
  // we don't pay to deploy dormant accounts every day.
  const activeAccounts = new Set<string>();
  if (conns.length) {
    const cutoff = new Date(
      Date.now() - IDLE_TRADE_DAYS * 86_400_000,
    ).toISOString();
    const { data: recent } = await admin
      .from('trades')
      .select('account_id')
      .in(
        'account_id',
        conns.map((c) => c.account_id),
      )
      .gt('closed_at', cutoff);
    for (const r of (recent ?? []) as Array<{ account_id: string }>) {
      activeAccounts.add(r.account_id);
    }
  }

  const now = Date.now();
  const hoursSince = (iso: string | null) =>
    iso ? (now - new Date(iso).getTime()) / 3_600_000 : Infinity;

  const due = conns
    .filter((c) => {
      // Breached prop accounts are dead at the firm, and over-limit accounts had
      // their MetaApi account removed; never pay to sync either.
      if (c.state === 'breached' || c.state === 'over_limit') return false;
      // Back off accounts that just failed or are still connecting.
      if (
        (c.state === 'connecting' || c.state === 'error') &&
        hoursSince(c.updated_at) < BACKOFF_HOURS
      ) {
        return false;
      }
      if (!c.last_synced_at) return true; // never synced -> first sync
      const interval = activeAccounts.has(c.account_id)
        ? DAILY_HOURS
        : IDLE_HOURS;
      return hoursSince(c.last_synced_at) >= interval;
    })
    // Most overdue first (never-synced sorts to the front).
    .sort((a, b) => hoursSince(b.last_synced_at) - hoursSince(a.last_synced_at));

  // Each deploy-on-demand sync can take up to ~45s and the function caps at 60s,
  // so process a bounded slice; the rest get picked up on the next tick.
  const batch = due.slice(0, MAX_PER_RUN);

  const results = [];
  for (const c of batch) {
    const r = await syncConnection(admin, c, c.user_id);
    results.push(r);
    // Log only completed syncs (a real deploy + fetch) for the cost audit. Auto
    // syncs never count against the user's manual-refresh cap.
    if (!r.error) await logRefresh(admin, c.user_id, c.id, 'auto');
  }

  return NextResponse.json({
    dueTotal: due.length,
    processed: batch.length,
    results,
  });
}
