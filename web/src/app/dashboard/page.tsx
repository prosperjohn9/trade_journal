'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
  getOrCreateProfile,
  updateProfile,
  type Profile,
} from '@/src/lib/profile';

type Trade = {
  id: string;
  opened_at: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl_amount: number;
  pnl_percent: number;
  r_multiple: number | null;
};

function numOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toNumberSafe(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(amount: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(amount);
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function signColor(n: number) {
  if (n > 0) return 'text-emerald-600';
  if (n < 0) return 'text-rose-600';
  return 'text-slate-700';
}

function badgeClasses(outcome: Trade['outcome']) {
  switch (outcome) {
    case 'WIN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'LOSS':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export default function DashboardPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);

  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [startingBalanceDraft, setStartingBalanceDraft] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Load session + profile
  useEffect(() => {
    (async () => {
      try {
        const { profile, user } = await getOrCreateProfile();
        if (!user) return router.push('/auth');

        setProfile(profile);
        setDisplayNameDraft(profile?.display_name ?? '');

        const sb = (profile as any)?.starting_balance;
        setStartingBalanceDraft(
          sb === null || sb === undefined ? '' : String(sb)
        );
      } catch (e: any) {
        console.error(e);
        router.push('/auth');
      }
    })();
  }, [router]);

  // Load trades for selected month
  useEffect(() => {
    (async () => {
      const start = new Date(`${month}-01T00:00:00`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      const { data, error } = await supabase
        .from('trades')
        .select(
          'id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, r_multiple'
        )
        .gte('opened_at', start.toISOString())
        .lt('opened_at', end.toISOString())
        .order('opened_at', { ascending: true });

      if (!error && data) setTrades(data as Trade[]);
      if (error) console.error(error);
    })();
  }, [month]);

  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter((t) => t.outcome === 'WIN').length;
    const losses = trades.filter((t) => t.outcome === 'LOSS').length;
    const be = trades.filter((t) => t.outcome === 'BREAKEVEN').length;

    const pnl$ = trades.reduce((s, t) => s + Number(t.pnl_amount), 0);
    const pnlPct = trades.reduce((s, t) => s + Number(t.pnl_percent), 0);

    const winRate = total ? (wins / total) * 100 : 0;

    return { total, wins, losses, be, pnl$, pnlPct, winRate };
  }, [trades]);

  const startingBalanceRaw = (profile as any)?.starting_balance;
  const hasStartingBalance =
    startingBalanceRaw !== null && startingBalanceRaw !== undefined;

  const startingBalance = hasStartingBalance
    ? toNumberSafe(startingBalanceRaw)
    : 0;
  const equity = hasStartingBalance ? startingBalance + stats.pnl$ : null;

  const currency = (profile as any)?.base_currency || 'USD';

  async function logout() {
    await supabase.auth.signOut();
    router.push('/auth');
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg('Saving...');

    try {
      const starting_balance = numOrNull(startingBalanceDraft);

      const updated = await updateProfile({
        display_name: displayNameDraft.trim() || null,
        starting_balance,
      } as any);

      setProfile(updated);
      setDisplayNameDraft(updated.display_name ?? '');

      const sb = (updated as any)?.starting_balance;
      setStartingBalanceDraft(
        sb === null || sb === undefined ? '' : String(sb)
      );

      setProfileMsg('Saved');
      setShowProfile(false);
    } catch (e: any) {
      console.error(e);
      setProfileMsg(e?.message ?? 'Failed to save');
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMsg(''), 2000);
    }
  }

  async function deleteTrade(id: string) {
    const ok = confirm('Delete this trade? This cannot be undone.');
    if (!ok) return;

    const { error } = await supabase.from('trades').delete().eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }

    setTrades((prev) => prev.filter((t) => t.id !== id));
  }

  const displayName =
    profile?.display_name?.trim() || profile?.display_name || 'Trader';

  const equityUp = equity !== null && equity >= startingBalance;
  const equityDown = equity !== null && equity < startingBalance;

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Dashboard</h1>
          <div className='text-sm opacity-80'>
            Signed in as <span className='font-semibold'>{displayName}</span>
          </div>

          {!hasStartingBalance && (
            <div className='text-sm opacity-80'>
              <span className='font-semibold'>Tip:</span> Set your{' '}
              <span className='font-semibold'>Starting Balance</span> to make
              your equity curve and drawdown meaningful.
              <button
                className='ml-2 underline'
                onClick={() => setShowProfile(true)}>
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
            onClick={() => setShowProfile((v) => !v)}>
            {showProfile ? 'Close' : 'Edit Profile'}
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/trades/new')}>
            + Add Trade
          </button>

          <button className='border rounded-lg px-4 py-2' onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {profile && showProfile && (
        <section className='border rounded-xl p-4 max-w-3xl space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='font-semibold'>Profile</h2>
            {profileMsg && (
              <span className='text-sm opacity-80'>{profileMsg}</span>
            )}
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
                Used for equity curve & drawdown in Monthly Reports.
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
              value={formatMoney(startingBalance, currency)}
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
        <Card title='Win Rate' value={`${formatNumber(stats.winRate)}%`} />
        <Card
          title='P&L ($)'
          value={formatMoney(stats.pnl$, currency)}
          valueClassName={signColor(stats.pnl$)}
        />
        <Card
          title='P&L (%)'
          value={`${formatNumber(stats.pnlPct)}%`}
          valueClassName={signColor(stats.pnlPct)}
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
                <th className='p-2'>Actions</th>
              </tr>
            </thead>

            <tbody>
              {trades.map((t) => {
                const pnlAmt = Number(t.pnl_amount);
                const pnlPct = Number(t.pnl_percent);

                return (
                  <tr key={t.id} className='border-b'>
                    <td className='p-2'>
                      {new Date(t.opened_at).toLocaleString()}
                    </td>
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
                    <td
                      className={cx(
                        'p-2 font-medium',
                        signColor(pnlPct)
                      )}>{`${formatNumber(pnlPct)}%`}</td>

                    <td className='p-2'>
                      {t.r_multiple === null || t.r_multiple === undefined
                        ? '—'
                        : formatNumber(Number(t.r_multiple))}
                    </td>

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
                          onClick={() => deleteTrade(t.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!trades.length && (
                <tr>
                  <td className='p-2 opacity-70' colSpan={8}>
                    No trades for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  value: any;
  valueClassName?: string;
}) {
  return (
    <div className='border rounded-xl p-4'>
      <div className='text-sm opacity-70'>{title}</div>
      <div className={cx('text-xl font-semibold', valueClassName)}>{value}</div>
    </div>
  );
}