'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabaseClient';
import {
  getOrCreateProfile,
  updateProfile,
  type Profile,
} from '@/src/lib/profile';

type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
type Direction = 'BUY' | 'SELL';

type Trade = {
  id: string;
  opened_at: string;
  instrument: string;
  direction: Direction;
  outcome: Outcome;
  pnl_amount: number;
  pnl_percent: number;
  commission: number | null;
  net_pnl: number | null;
  r_multiple: number | null;
  template_id: string | null;
  reviewed_at: string | null;
};

type CriteriaCheckRow = {
  trade_id: string;
  item_id: string;
  checked: boolean;
};

type TemplateItemRow = {
  id: string;
  template_id: string;
  is_active: boolean;
};

type UpdateProfileInput = {
  display_name: string | null;
  starting_balance: number | null;
};

// Parse a numeric input from an <input> value. Empty/invalid => null.
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Coerce unknown values to a finite number (otherwise 0).
function toNumberSafe(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(amount: number, maxDigits = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits }).format(
    amount
  );
}

function formatPercent(amount: number, maxDigits = 2): string {
  return `${formatNumber(amount, maxDigits)}%`;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function signColor(n: number): string {
  if (n > 0) return 'text-emerald-600';
  if (n < 0) return 'text-rose-600';
  return 'text-slate-700';
}

function badgeClasses(outcome: Outcome): string {
  switch (outcome) {
    case 'WIN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'LOSS':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function reviewedBadge(reviewedAt: string | null) {
  return reviewedAt ? (
    <span className='text-xs border rounded-full px-2 py-1 bg-slate-50'>
      Reviewed
    </span>
  ) : (
    <span className='text-xs border rounded-full px-2 py-1 bg-white'>
      Not reviewed
    </span>
  );
}

// Minimal modal used for logout/delete confirmations. 
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
      aria-modal='true'
      role='dialog'>
      {/* Backdrop */}
      <button
        className='absolute inset-0 bg-black/40'
        onClick={onClose}
        aria-label='Close modal'
      />

      <div className='relative w-full max-w-md rounded-xl border bg-white p-4 shadow-lg'>
        <div className='flex items-start justify-between gap-3'>
          <div className='text-lg font-semibold'>{title}</div>
          <button className='border rounded-lg px-3 py-1' onClick={onClose}>
            ✕
          </button>
        </div>
        <div className='mt-3'>{children}</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);

  // Some fields may not be present on the generated Profile type.
  type ProfileExtras = {
    base_currency?: string | null;
    starting_balance?: number | string | null;
  };
  const profileExtras = (profile ?? null) as unknown as ProfileExtras | null;

  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [startingBalanceDraft, setStartingBalanceDraft] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  const [trades, setTrades] = useState<Trade[]>([]);
  
  // Sum of GROSS P&L ($) from all trades strictly BEFORE the selected month.
  // (Gross = pnl_amount as stored on the trade; commission is NOT subtracted here.)
  const [priorPnlDollar, setPriorPnlDollar] = useState(0);
  const [loadingPriorPnl, setLoadingPriorPnl] = useState(false);

  // Selected month controls the table/stats range.
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Checklist score per trade (0–100). null => no checklist available for this trade.
  const [checklistScoreByTrade, setChecklistScoreByTrade] = useState<
    Record<string, number | null>
  >({});

  // Delete confirmation modal state.
  const [deleteTradeTarget, setDeleteTradeTarget] = useState<Trade | null>(null);
  const [deletingTrade, setDeletingTrade] = useState(false);

  // Logout confirmation modal state.
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const currency = profileExtras?.base_currency ?? 'USD';

  const startingBalanceRaw = profileExtras?.starting_balance;
  const hasStartingBalance =
    startingBalanceRaw !== null && startingBalanceRaw !== undefined;
  const startingBalance = hasStartingBalance ? toNumberSafe(startingBalanceRaw) : 0;

  // --- Auth + profile ---
  useEffect(() => {
    (async () => {
      try {
        const { profile, user } = await getOrCreateProfile();
        if (!user) {
          router.push('/auth');
          return;
        }

        setProfile(profile);
        setDisplayNameDraft(profile?.display_name ?? '');

        const sb = (profile as unknown as ProfileExtras)?.starting_balance;
        setStartingBalanceDraft(sb === null || sb === undefined ? '' : String(sb));
      } catch (err: unknown) {
        console.error(err);
        router.push('/auth');
      }
    })();
  }, [router]);

  // --- Trades (selected month) ---
  useEffect(() => {
    (async () => {
      const start = new Date(`${month}-01T00:00:00`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      const { data, error } = await supabase
        .from('trades')
        .select(
          'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, commission, net_pnl, r_multiple, template_id, reviewed_at'
        )
        .gte('opened_at', start.toISOString())
        .lt('opened_at', end.toISOString())
        .order('opened_at', { ascending: true });

      if (error) {
        console.error(error);
        setTrades([]);
        return;
      }

      setTrades((data || []) as Trade[]);
    })();
  }, [month]);

  // --- Prior GROSS P&L (all trades before selected month) ---
  // Used to roll forward equity (gross-based): previous month ending equity becomes this month's starting balance.
  useEffect(() => {
    (async () => {
      if (!hasStartingBalance) {
        setPriorPnlDollar(0);
        return;
      }

      setLoadingPriorPnl(true);
      try {
        const start = new Date(`${month}-01T00:00:00`);

        // Fetch net_pnl, pnl_amount, commission for trades before this month and sum client-side.
        const { data, error } = await supabase
          .from('trades')
          .select('net_pnl, pnl_amount, commission')
          .lt('opened_at', start.toISOString());

        if (error) {
          console.error(error);
          setPriorPnlDollar(0);
          return;
        }

        const sum = (data || []).reduce((acc, row) => {
          const r = row as {
            net_pnl?: unknown;
            pnl_amount?: unknown;
            commission?: unknown;
          };

          const net = Number(r.net_pnl);
          if (Number.isFinite(net)) return acc + net;

          const gross = Number(r.pnl_amount ?? 0);
          const comm = Number(r.commission ?? 0);
          return acc + (Number.isFinite(gross) ? gross : 0) - (Number.isFinite(comm) ? comm : 0);
        }, 0);

        setPriorPnlDollar(sum);
      } catch (err: unknown) {
        console.error(err);
        setPriorPnlDollar(0);
      } finally {
        setLoadingPriorPnl(false);
      }
    })();
  }, [month, hasStartingBalance]);

  // --- Checklist scores ---
  // Score is computed from: checked items / active items for the trade's setup template.
  useEffect(() => {
    (async () => {
      setChecklistScoreByTrade({});
      if (!trades.length) return;

      const tradeIds = trades.map((t) => t.id);
      const templateIds = Array.from(
        new Set(trades.map((t) => t.template_id).filter(Boolean))
      ) as string[];

      // Default: no checklist available.
      const baseScores: Record<string, number | null> = {};
      for (const t of trades) baseScores[t.id] = null;

      if (!templateIds.length) {
        setChecklistScoreByTrade(baseScores);
        return;
      }

      // 1) Denominator: number of active items per template.
      const { data: itemsData, error: itemsErr } = await supabase
        .from('setup_template_items')
        .select('id, template_id, is_active')
        .in('template_id', templateIds)
        .eq('is_active', true);

      if (itemsErr) {
        console.error(itemsErr);
        setChecklistScoreByTrade(baseScores);
        return;
      }

      const activeItems = (itemsData || []) as TemplateItemRow[];
      const denomByTemplate: Record<string, number> = {};
      const activeItemIds = activeItems.map((i) => i.id);

      for (const it of activeItems) {
        denomByTemplate[it.template_id] = (denomByTemplate[it.template_id] || 0) + 1;
      }

      if (!activeItemIds.length) {
        setChecklistScoreByTrade(baseScores);
        return;
      }

      // 2) Numerator: number of checked=true rows per trade (restricted to active items).
      const { data: checksData, error: checksErr } = await supabase
        .from('trade_criteria_checks')
        .select('trade_id, item_id, checked')
        .in('trade_id', tradeIds)
        .in('item_id', activeItemIds);

      if (checksErr) {
        console.error(checksErr);
        setChecklistScoreByTrade(baseScores);
        return;
      }

      const checks = (checksData || []) as CriteriaCheckRow[];
      const checkedTrueByTrade: Record<string, number> = {};

      for (const row of checks) {
        if (row.checked) {
          checkedTrueByTrade[row.trade_id] = (checkedTrueByTrade[row.trade_id] || 0) + 1;
        }
      }

      // 3) Final scores.
      const scores: Record<string, number | null> = { ...baseScores };

      for (const t of trades) {
        if (!t.template_id) {
          scores[t.id] = null;
          continue;
        }

        const denom = denomByTemplate[t.template_id] || 0;
        if (!denom) {
          scores[t.id] = null;
          continue;
        }

        const num = checkedTrueByTrade[t.id] || 0;
        scores[t.id] = (num / denom) * 100;
      }

      setChecklistScoreByTrade(scores);
    })();
  }, [trades]);

  // --- Summary stats for the selected month (NET P&L based) ---
  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter((t) => t.outcome === 'WIN').length;
    const losses = trades.filter((t) => t.outcome === 'LOSS').length;
    const be = trades.filter((t) => t.outcome === 'BREAKEVEN').length;

    // Net $ P&L: prefer stored net_pnl; fallback to gross - commission.
    const pnlDollar = trades.reduce((s, t) => {
      const net = Number(t.net_pnl);
      if (Number.isFinite(net)) return s + net;
      const gross = Number(t.pnl_amount ?? 0);
      const comm = Number(t.commission ?? 0);
      return s + (Number.isFinite(gross) ? gross : 0) - (Number.isFinite(comm) ? comm : 0);
    }, 0);

    // Win rate uses trade outcomes.
    const winRate = total ? (wins / total) * 100 : 0;

    return { total, wins, losses, be, pnlDollar, winRate };
  }, [trades]);

  // Month starting balance is the ending equity of the previous month (gross-based).
  // = profile starting_balance + sum(gross P&L of all trades before this month)
  const monthStartingBalance = hasStartingBalance ? startingBalance + priorPnlDollar : null;

  const monthPnlPct = monthStartingBalance ? (stats.pnlDollar / monthStartingBalance) * 100 : 0;

  // Equity for the selected month (gross-based).
  const equity = monthStartingBalance === null ? null : monthStartingBalance + stats.pnlDollar;

  const displayName =
    profile?.display_name?.trim() || profile?.display_name || 'Trader';

  const equityUp = equity !== null && monthStartingBalance !== null && equity >= monthStartingBalance;
  const equityDown = equity !== null && monthStartingBalance !== null && equity < monthStartingBalance;

  function requestLogout() {
    setShowLogout(true);
  }

  async function confirmLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await supabase.auth.signOut();
      setShowLogout(false);
      router.push('/auth');
    } finally {
      setLoggingOut(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg('Saving...');

    try {
      const payload: UpdateProfileInput = {
        display_name: displayNameDraft.trim() || null,
        starting_balance: numOrNull(startingBalanceDraft),
      };

      const updated = await updateProfile(payload as unknown as Partial<Profile>);

      setProfile(updated);
      setDisplayNameDraft(updated.display_name ?? '');

      const sb = (updated as unknown as ProfileExtras)?.starting_balance;
      setStartingBalanceDraft(sb === null || sb === undefined ? '' : String(sb));

      setProfileMsg('Saved');
      setShowProfile(false);
    } catch (err: unknown) {
      console.error(err);
      setProfileMsg(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMsg(''), 2000);
    }
  }

  function requestDeleteTrade(t: Trade) {
    setDeleteTradeTarget(t);
  }

  async function confirmDeleteTrade() {
    if (!deleteTradeTarget) return;

    setDeletingTrade(true);

    const id = deleteTradeTarget.id;
    const { error } = await supabase.from('trades').delete().eq('id', id);

    if (error) {
      alert(error.message);
      setDeletingTrade(false);
      return;
    }

    setTrades((prev) => prev.filter((t) => t.id !== id));
    setDeleteTradeTarget(null);
    setDeletingTrade(false);
  }

  return (
    <main className='p-6 space-y-6'>
      {/* Logout confirmation */}
      <Modal
        open={showLogout}
        title='Log out?'
        onClose={() => {
          if (!loggingOut) setShowLogout(false);
        }}>
        <p className='text-sm opacity-80'>Are you sure you want to log out?</p>

        <div className='mt-4 flex gap-2 justify-end'>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={() => setShowLogout(false)}
            disabled={loggingOut}>
            Cancel
          </button>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={confirmLogout}
            disabled={loggingOut}>
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTradeTarget}
        title='Delete trade?'
        onClose={() => {
          if (!deletingTrade) setDeleteTradeTarget(null);
        }}>
        <p className='text-sm opacity-80'>
          This will permanently delete this trade. This cannot be undone.
        </p>

        {deleteTradeTarget && (
          <div className='mt-3 text-sm'>
            <div className='opacity-80'>
              <span className='font-semibold'>{deleteTradeTarget.instrument}</span> •{' '}
              {deleteTradeTarget.direction} • {deleteTradeTarget.outcome}
            </div>
            <div className='opacity-70'>
              {new Date(deleteTradeTarget.opened_at).toLocaleString()}
            </div>
          </div>
        )}

        <div className='mt-4 flex gap-2 justify-end'>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={() => setDeleteTradeTarget(null)}
            disabled={deletingTrade}>
            Cancel
          </button>
          <button
            className='border rounded-lg px-4 py-2 disabled:opacity-60'
            onClick={confirmDeleteTrade}
            disabled={deletingTrade}>
            {deletingTrade ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>

      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Dashboard</h1>
          <div className='text-sm opacity-80'>
            Signed in as <span className='font-semibold'>{displayName}</span>
          </div>

          {!hasStartingBalance && (
            <div className='text-sm opacity-80'>
              <span className='font-semibold'>Tip:</span> Set your{' '}
              <span className='font-semibold'>Starting Balance</span> to make your equity
              curve and drawdown meaningful.
              <button className='ml-2 underline' onClick={() => setShowProfile(true)}>
                Set now
              </button>
            </div>
          )}
        </div>

        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/reports/monthly')}>
            Monthly Report
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/analytics')}>
            Analytics
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => setShowProfile((v) => !v)}>
            {showProfile ? 'Close' : 'Edit Profile'}
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/trades/new')}>
            + Add Trade
          </button>

          <button className='border rounded-lg px-4 py-2' onClick={requestLogout}>
            Logout
          </button>
        </div>
      </header>

      {profile && showProfile && (
        <section className='border rounded-xl p-4 max-w-3xl space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='font-semibold'>Profile</h2>
            {profileMsg && <span className='text-sm opacity-80'>{profileMsg}</span>}
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <label className='space-y-1 block'>
              <div className='text-sm opacity-70'>Username</div>
              <input
                className='w-full border rounded-lg p-3'
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder='e.g., Prosper'
              />
            </label>

            <label className='space-y-1 block'>
              <div className='text-sm opacity-70'>Starting Balance</div>
              <input
                className='w-full border rounded-lg p-3'
                type='number'
                step='0.01'
                value={startingBalanceDraft}
                onChange={(e) => setStartingBalanceDraft(e.target.value)}
                placeholder='e.g., 100000'
              />
              <div className='text-xs opacity-60'>
                Used as your initial balance. Each new month starts at the previous month’s ending equity.
              </div>
            </label>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              className='border rounded-lg px-4 py-2 disabled:opacity-60'
              onClick={saveProfile}
              disabled={savingProfile}>
              Save Profile
            </button>
          </div>
        </section>
      )}

      <section className='flex items-center gap-3'>
        <label className='text-sm opacity-80'>Month:</label>
        <input
          className='border rounded-lg p-2'
          type='month'
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </section>

      <section className='grid grid-cols-2 md:grid-cols-4 gap-3'>
        {hasStartingBalance && (
          <>
            <Card
              title='Starting Balance'
              value={
                monthStartingBalance === null
                  ? '—'
                  : loadingPriorPnl
                  ? '…'
                  : formatMoney(monthStartingBalance, currency)
              }
              valueClassName='text-slate-900'
            />
            <Card
              title='Equity'
              value={equity === null ? '—' : formatMoney(equity, currency)}
              valueClassName={cx(
                equityUp && 'text-emerald-700',
                equityDown && 'text-rose-700'
              )}
            />
          </>
        )}

        <Card title='Trades' value={stats.total} />
        <Card title='Win Rate' value={formatPercent(stats.winRate, 0)} />
        <Card
          title='P&L ($)'
          value={formatMoney(stats.pnlDollar, currency)}
          valueClassName={signColor(stats.pnlDollar)}
        />
        <Card
          title='P&L (%)'
          value={formatPercent(monthPnlPct, 2)}
          valueClassName={signColor(monthPnlPct)}
        />
        <Card title='Wins' value={stats.wins} />
        <Card title='Losses' value={stats.losses} />
        <Card title='Breakeven' value={stats.be} />
      </section>

      <section className='border rounded-xl p-4'>
        <h2 className='font-semibold mb-3'>Trades</h2>

        <div className='overflow-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-left border-b'>
                <th className='p-2'>Date</th>
                <th className='p-2'>Instrument</th>
                <th className='p-2'>Dir</th>
                <th className='p-2'>Outcome</th>
                <th className='p-2'>P&L ($)</th>
                <th className='p-2'>P&L (%)</th>
                <th className='p-2'>R</th>
                <th className='p-2'>Checklist</th>
                <th className='p-2'>Reviewed</th>
                <th className='p-2'>Actions</th>
              </tr>
            </thead>

            <tbody>
              {trades.map((t) => {
                const pnlAmt = Number.isFinite(Number(t.net_pnl))
                  ? Number(t.net_pnl)
                  : Number(t.pnl_amount || 0) - Number(t.commission || 0);

                const pnlPct = monthStartingBalance
                  ? (pnlAmt / monthStartingBalance) * 100
                  : 0;
                const score = checklistScoreByTrade[t.id] ?? null;

                return (
                  <tr key={t.id} className='border-b'>
                    <td className='p-2'>{new Date(t.opened_at).toLocaleString()}</td>
                    <td className='p-2'>{t.instrument}</td>
                    <td className='p-2'>{t.direction}</td>

                    <td className='p-2'>
                      <span
                        className={cx(
                          'inline-flex items-center px-2 py-1 rounded-full border text-xs font-semibold',
                          badgeClasses(t.outcome)
                        )}>
                        {t.outcome}
                      </span>
                    </td>

                    <td className={cx('p-2 font-medium', signColor(pnlAmt))}>
                      {formatMoney(pnlAmt, currency)}
                    </td>
                    <td className={cx('p-2 font-medium', signColor(pnlPct))}>
                      {formatPercent(pnlPct, 2)}
                    </td>

                    <td className='p-2'>
                      {t.r_multiple === null || t.r_multiple === undefined
                        ? '—'
                        : formatNumber(Number(t.r_multiple), 2)}
                    </td>

                    <td className='p-2'>
                      {score === null ? '—' : `${score.toFixed(0)}%`}
                    </td>

                    <td className='p-2'>{reviewedBadge(t.reviewed_at)}</td>

                    <td className='p-2'>
                      <div className='flex flex-wrap gap-2'>
                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => router.push(`/trades/${t.id}`)}>
                          View
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => router.push(`/trades/${t.id}/edit`)}>
                          Edit
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => router.push(`/trades/${t.id}/review`)}>
                          Review
                        </button>

                        <button
                          className='border rounded-lg px-3 py-1'
                          onClick={() => requestDeleteTrade(t)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!trades.length && (
                <tr>
                  <td className='p-2 opacity-70' colSpan={10}>
                    No trades for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className='text-xs opacity-70 mt-3'>
          Checklist score is based on what you checked when you added the trade.
        </div>
      </section>
    </main>
  );
}

function Card({
  title,
  value,
  valueClassName,
}: {
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className={cx('text-xl font-semibold', valueClassName)}>{value}</div>
    </div>
  );
}