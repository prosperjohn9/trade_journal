'use client';

import { type ReactNode } from 'react';
import useSWR from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import {
  computePropStatus,
  type PropRules,
  type PropStatus,
} from '@/src/lib/analytics/propFirm';

type PropAccountRow = {
  id: string;
  name: string;
  starting_balance: number | null;
  base_currency: string | null;
  prop_rules: PropRules | null;
};

type Challenge = {
  id: string;
  name: string;
  currency: string;
  rules: PropRules;
  status: PropStatus;
};

function hasObjectives(r: PropRules | null): r is PropRules {
  return (
    r != null &&
    (r.profitTargetPct != null ||
      r.maxDrawdownPct != null ||
      r.dailyLossPct != null ||
      r.minTradingDays != null ||
      r.accountSize != null)
  );
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  }
}

async function loadPropChallenges(accountId: string): Promise<Challenge[]> {
  let accountsQuery = supabase
    .from('accounts')
    .select('id, name, starting_balance, base_currency, prop_rules')
    .not('prop_rules', 'is', null);
  if (accountId !== 'all') accountsQuery = accountsQuery.eq('id', accountId);

  const { data: accountsData } = await accountsQuery;
  const propAccounts = ((accountsData ?? []) as PropAccountRow[]).filter((a) =>
    hasObjectives(a.prop_rules),
  );
  if (!propAccounts.length) return [];

  const ids = propAccounts.map((a) => a.id);
  const [tradesRes, eventsRes] = await Promise.all([
    supabase
      .from('trades')
      .select('account_id, opened_at, closed_at, net_pnl, pnl_amount')
      .in('account_id', ids),
    supabase
      .from('account_balance_events')
      .select('account_id, kind, amount, occurred_at')
      .in('account_id', ids),
  ]);

  const tradesByAccount = new Map<string, { at: string; pnl: number }[]>();
  for (const t of (tradesRes.data ?? []) as Array<{
    account_id: string;
    opened_at: string;
    closed_at: string | null;
    net_pnl: number | null;
    pnl_amount: number | null;
  }>) {
    const arr = tradesByAccount.get(t.account_id) ?? [];
    arr.push({
      at: t.closed_at ?? t.opened_at,
      pnl: Number(t.net_pnl ?? t.pnl_amount ?? 0),
    });
    tradesByAccount.set(t.account_id, arr);
  }

  const cashByAccount = new Map<string, { at: string; amount: number }[]>();
  for (const e of (eventsRes.data ?? []) as Array<{
    account_id: string;
    kind: string;
    amount: number;
    occurred_at: string;
  }>) {
    const arr = cashByAccount.get(e.account_id) ?? [];
    arr.push({
      at: e.occurred_at,
      amount: e.kind === 'DEPOSIT' ? Number(e.amount) : -Number(e.amount),
    });
    cashByAccount.set(e.account_id, arr);
  }

  return propAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.base_currency || 'USD',
    rules: a.prop_rules as PropRules,
    status: computePropStatus({
      startingBalance: Number(a.starting_balance ?? 0),
      rules: a.prop_rules as PropRules,
      trades: tradesByAccount.get(a.id) ?? [],
      cashflows: cashByAccount.get(a.id) ?? [],
    }),
  }));
}

function StatusBadge({ status }: { status: PropStatus['status'] }) {
  const map = {
    passed: { label: 'Passed', color: 'var(--profit)' },
    breached: { label: 'Breached', color: 'var(--loss)' },
    in_progress: { label: 'In progress', color: 'var(--accent)' },
  } as const;
  const c = map[status];
  return (
    <span
      className='inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold'
      style={{
        color: c.color,
        backgroundColor: `color-mix(in srgb, ${c.color} 16%, transparent)`,
      }}>
      {c.label}
    </span>
  );
}

function Tile({
  label,
  value,
  tone = 'neutral',
  pct,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'neutral';
  pct?: number;
}) {
  const color =
    tone === 'good'
      ? 'var(--profit)'
      : tone === 'bad'
        ? 'var(--loss)'
        : 'var(--text-primary)';
  return (
    <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
      <div className='text-[11px] text-[var(--text-muted)]'>{label}</div>
      <div className='mt-0.5 text-sm font-semibold' style={{ color }}>
        {value}
      </div>
      {pct != null ? (
        <div className='mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]'>
          <div
            className='h-full rounded-full'
            style={{
              width: `${Math.max(0, Math.min(100, pct))}%`,
              backgroundColor: tone === 'bad' ? 'var(--loss)' : 'var(--accent)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function challengeTiles(c: Challenge): ReactNode[] {
  const { status: s, rules, currency } = c;
  const tiles: ReactNode[] = [];

  if (s.profitTargetAmount != null) {
    tiles.push(
      <Tile
        key='target'
        label='Profit target'
        value={
          s.targetMet ? 'Achieved' : `${Math.round(s.profitProgressPct ?? 0)}%`
        }
        tone={s.targetMet ? 'good' : 'neutral'}
        pct={s.profitProgressPct ?? 0}
      />,
    );
  }

  if (s.drawdownBufferAmount != null && rules.maxDrawdownPct != null) {
    const allowed = (s.accountSize * rules.maxDrawdownPct) / 100;
    const remaining = s.drawdownBufferAmount;
    const danger = remaining <= allowed / 3;
    tiles.push(
      <Tile
        key='maxloss'
        label='Max loss left'
        value={s.maxDrawdownBreached ? 'Breached' : money(remaining, currency)}
        tone={s.maxDrawdownBreached || danger ? 'bad' : 'good'}
        pct={allowed > 0 ? ((allowed - Math.max(0, remaining)) / allowed) * 100 : 0}
      />,
    );
  }

  if (s.dailyLossLimit != null) {
    const remaining = s.dailyRemainingToday ?? s.dailyLossLimit;
    tiles.push(
      <Tile
        key='daily'
        label='Daily room left'
        value={s.dailyLimitBreached ? 'Breached' : money(remaining, currency)}
        tone={s.dailyLimitBreached ? 'bad' : 'good'}
      />,
    );
  }

  if (s.minTradingDays != null) {
    tiles.push(
      <Tile
        key='days'
        label='Trading days'
        value={
          s.minDaysMet
            ? `${s.tradingDays} (met)`
            : `${s.tradingDays} / ${s.minTradingDays}`
        }
        tone={s.minDaysMet ? 'good' : 'neutral'}
        pct={
          s.minTradingDays ? (s.tradingDays / s.minTradingDays) * 100 : undefined
        }
      />,
    );
  }

  return tiles;
}

export function PropChallengeWidget({ accountId }: { accountId: string }) {
  const { data } = useSWR(['prop-challenges', accountId], () =>
    loadPropChallenges(accountId),
  );

  if (!data || data.length === 0) return null;

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-lg font-semibold'>Challenge status</h2>
        <span className='text-xs text-[var(--text-muted)]'>
          {data.length} {data.length === 1 ? 'account' : 'accounts'}
        </span>
      </div>

      <div className='space-y-4'>
        {data.map((c) => {
          const tiles = challengeTiles(c);
          return (
            <div
              key={c.id}
              className='rounded-lg border border-[var(--border-default)] p-4'>
              <div className='mb-3 flex items-center justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='truncate text-sm font-semibold text-[var(--text-primary)]'>
                    {c.name}
                  </div>
                  <div className='text-[11px] text-[var(--text-muted)]'>
                    {c.rules.firm || 'Challenge'}
                    {c.rules.phase ? ` · ${c.rules.phase}` : ''} ·{' '}
                    {money(c.status.currentBalance, c.currency)} of{' '}
                    {money(c.status.accountSize, c.currency)}
                  </div>
                </div>
                <StatusBadge status={c.status.status} />
              </div>

              {tiles.length ? (
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                  {tiles}
                </div>
              ) : (
                <p className='text-xs text-[var(--text-muted)]'>
                  No objectives set. Add rules in Settings, Accounts.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
