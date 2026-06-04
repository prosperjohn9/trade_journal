'use client';

import { useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import {
  computePropStatus,
  type PropRules,
  type PropStatus,
} from '@/src/lib/analytics/propFirm';

const inputClass =
  'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';

function fmt(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className='block'>
      <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
        {label}
      </span>
      {children}
    </label>
  );
}

type Tone = 'good' | 'bad' | 'neutral';

function toneColor(t: Tone): string {
  return t === 'good'
    ? 'var(--profit)'
    : t === 'bad'
      ? 'var(--loss)'
      : 'var(--accent)';
}

function Objective({
  label,
  right,
  rightTone = 'neutral',
  detail,
  pct,
  barTone,
}: {
  label: string;
  right: string;
  rightTone?: Tone;
  detail?: string;
  pct: number;
  barTone: Tone;
}) {
  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between text-sm'>
        <span className='font-medium text-[var(--text-primary)]'>{label}</span>
        <span
          className='text-xs font-semibold'
          style={{
            color:
              rightTone === 'neutral'
                ? 'var(--text-secondary)'
                : toneColor(rightTone),
          }}>
          {right}
        </span>
      </div>
      {detail ? (
        <div className='text-[11px] text-[var(--text-muted)]'>{detail}</div>
      ) : null}
      <div className='h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]'>
        <div
          className='h-full rounded-full'
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            backgroundColor: toneColor(barTone),
          }}
        />
      </div>
    </div>
  );
}

export function PropRulesButton({
  accountId,
  startingBalance,
  onChanged,
}: {
  accountId: string;
  startingBalance: number;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<PropRules | null>(null);
  const [status, setStatus] = useState<PropStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [firm, setFirm] = useState('');
  const [accountSize, setAccountSize] = useState('');
  const [phase, setPhase] = useState('');
  const [profitTargetPct, setProfitTargetPct] = useState('');
  const [maxDrawdownPct, setMaxDrawdownPct] = useState('');
  const [dailyLossPct, setDailyLossPct] = useState('');
  const [minTradingDays, setMinTradingDays] = useState('');
  const [maxDrawdownType, setMaxDrawdownType] = useState<'static' | 'trailing'>(
    'static',
  );
  const [dailyResetHourUtc, setDailyResetHourUtc] = useState('');

  function fillForm(r: PropRules) {
    setFirm(r.firm ?? '');
    setAccountSize(r.accountSize != null ? String(r.accountSize) : '');
    setPhase(r.phase ?? '');
    setProfitTargetPct(r.profitTargetPct != null ? String(r.profitTargetPct) : '');
    setMaxDrawdownPct(r.maxDrawdownPct != null ? String(r.maxDrawdownPct) : '');
    setDailyLossPct(r.dailyLossPct != null ? String(r.dailyLossPct) : '');
    setMinTradingDays(r.minTradingDays != null ? String(r.minTradingDays) : '');
    setMaxDrawdownType(r.maxDrawdownType === 'trailing' ? 'trailing' : 'static');
    setDailyResetHourUtc(
      r.dailyResetHourUtc != null ? String(r.dailyResetHourUtc) : '',
    );
  }

  // Sensible starting point (FundingPips/FTMO two-step) so the form is never
  // empty; the user adjusts to their actual challenge.
  function fillDefaults() {
    setFirm('');
    setAccountSize(String(startingBalance > 0 ? startingBalance : 10000));
    setPhase('');
    setProfitTargetPct('8');
    setMaxDrawdownPct('10');
    setDailyLossPct('5');
    setMinTradingDays('');
    setMaxDrawdownType('static');
    setDailyResetHourUtc('');
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [acctRes, tradesRes, eventsRes] = await Promise.all([
        supabase.from('accounts').select('prop_rules').eq('id', accountId).maybeSingle(),
        supabase
          .from('trades')
          .select('opened_at, closed_at, net_pnl, pnl_amount')
          .eq('account_id', accountId),
        supabase
          .from('account_balance_events')
          .select('kind, amount, occurred_at')
          .eq('account_id', accountId),
      ]);

      const raw = (acctRes.data?.prop_rules ?? null) as PropRules | null;
      const meaningful =
        raw != null &&
        (raw.profitTargetPct != null ||
          raw.maxDrawdownPct != null ||
          raw.dailyLossPct != null ||
          raw.minTradingDays != null ||
          raw.accountSize != null);
      const r = meaningful ? raw : null;
      setRules(r);
      if (r) {
        fillForm(r);
        setEditing(false);
      } else {
        fillDefaults();
        setEditing(true);
      }

      const trades = (
        (tradesRes.data ?? []) as Array<{
          opened_at: string;
          closed_at: string | null;
          net_pnl: number | null;
          pnl_amount: number | null;
        }>
      ).map((t) => ({
        at: t.closed_at ?? t.opened_at,
        pnl: Number(t.net_pnl ?? t.pnl_amount ?? 0),
      }));
      const cashflows = (
        (eventsRes.data ?? []) as Array<{
          kind: string;
          amount: number;
          occurred_at: string;
        }>
      ).map((e) => ({
        at: e.occurred_at,
        amount: e.kind === 'DEPOSIT' ? Number(e.amount) : -Number(e.amount),
      }));

      setStatus(
        r ? computePropStatus({ startingBalance, rules: r, trades, cashflows }) : null,
      );
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setMsg(null);
    setOpen(true);
    void loadAll();
  }

  function numOrUndef(s: string): number | undefined {
    const n = Number(s);
    return s.trim() && Number.isFinite(n) ? n : undefined;
  }

  async function save() {
    setMsg(null);
    setBusy(true);
    try {
      const next: PropRules = {
        firm: firm.trim() || undefined,
        accountSize: numOrUndef(accountSize),
        phase: phase.trim() || undefined,
        profitTargetPct: numOrUndef(profitTargetPct),
        maxDrawdownPct: numOrUndef(maxDrawdownPct),
        dailyLossPct: numOrUndef(dailyLossPct),
        minTradingDays: numOrUndef(minTradingDays),
        maxDrawdownType,
        dailyResetHourUtc: numOrUndef(dailyResetHourUtc),
      };
      const { error } = await supabase
        .from('accounts')
        .update({ prop_rules: next })
        .eq('id', accountId);
      if (error) throw error;
      setEditing(false);
      await loadAll();
      onChanged?.();
      await mutate(() => true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const statusChip = (s: PropStatus['status']) => {
    const map = {
      passed: { label: 'Passed', color: 'var(--profit)' },
      breached: { label: 'Breached', color: 'var(--loss)' },
      in_progress: { label: 'In progress', color: 'var(--accent)' },
    } as const;
    const c = map[s];
    return (
      <span
        className='inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold'
        style={{
          color: c.color,
          backgroundColor: `color-mix(in srgb, ${c.color} 16%, transparent)`,
        }}>
        {c.label}
      </span>
    );
  };

  function renderObjectives(s: PropStatus, r: PropRules): ReactNode {
    const objectives: ReactNode[] = [];

    if (s.profitTargetAmount != null) {
      objectives.push(
        <Objective
          key='target'
          label='Profit target'
          right={
            s.targetMet ? 'Achieved' : `${Math.round(s.profitProgressPct ?? 0)}%`
          }
          rightTone={s.targetMet ? 'good' : 'neutral'}
          detail={`${fmt(s.netProfit)} of ${fmt(s.profitTargetAmount)}`}
          pct={s.profitProgressPct ?? 0}
          barTone={s.targetMet ? 'good' : 'neutral'}
        />,
      );
    }

    if (s.maxDrawdownFloor != null && r.maxDrawdownPct != null) {
      const allowed = (s.accountSize * r.maxDrawdownPct) / 100;
      const remaining = s.drawdownBufferAmount ?? 0;
      const used = Math.max(0, allowed - remaining);
      const danger = remaining <= allowed / 3;
      objectives.push(
        <Objective
          key='maxloss'
          label={`Max loss${r.maxDrawdownType === 'trailing' ? ' (trailing)' : ''}`}
          right={s.maxDrawdownBreached ? 'Breached' : `${fmt(remaining)} left`}
          rightTone={s.maxDrawdownBreached || danger ? 'bad' : 'good'}
          detail={`Floor ${fmt(s.maxDrawdownFloor)}. Used ${fmt(used)} of ${fmt(allowed)} allowed.`}
          pct={allowed > 0 ? (used / allowed) * 100 : 0}
          barTone={s.maxDrawdownBreached || danger ? 'bad' : 'neutral'}
        />,
      );
    }

    if (s.dailyLossLimit != null) {
      const limit = s.dailyLossLimit;
      const usedToday = Math.max(0, -s.todayNet);
      const remaining = Math.max(0, limit - usedToday);
      objectives.push(
        <Objective
          key='daily'
          label='Max daily loss'
          right={
            s.dailyLimitBreached ? 'Breached' : `${fmt(remaining)} left today`
          }
          rightTone={s.dailyLimitBreached ? 'bad' : 'good'}
          detail={`Limit ${fmt(limit)} per day. Worst day ${s.worstDayLoss != null ? fmt(s.worstDayLoss) : 'n/a'}.`}
          pct={limit > 0 ? (usedToday / limit) * 100 : 0}
          barTone={s.dailyLimitBreached ? 'bad' : 'neutral'}
        />,
      );
    }

    if (s.minTradingDays != null) {
      objectives.push(
        <Objective
          key='days'
          label='Minimum trading days'
          right={s.minDaysMet ? 'Met' : `${s.tradingDays} of ${s.minTradingDays}`}
          rightTone={s.minDaysMet ? 'good' : 'neutral'}
          pct={s.minTradingDays ? (s.tradingDays / s.minTradingDays) * 100 : 0}
          barTone={s.minDaysMet ? 'good' : 'neutral'}
        />,
      );
    }

    return objectives.length ? (
      <div className='space-y-4'>{objectives}</div>
    ) : (
      <p className='text-sm text-[var(--text-muted)]'>
        No objectives set yet. Tap Edit rules to add your profit target and
        drawdown limits.
      </p>
    );
  }

  return (
    <>
      <span className='text-[var(--text-muted)]'>•</span>
      <button
        className='text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
        onClick={openModal}>
        Prop rules
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => !busy && setOpen(false)}>
          <div
            className='flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3'>
              <h3 className='text-base font-semibold'>Prop-firm challenge</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={() => !busy && setOpen(false)}
                aria-label='Close'>
                ✕
              </button>
            </div>

            <div className='flex-1 space-y-4 overflow-y-auto px-5 py-4'>
              {loading ? (
                <p className='text-sm text-[var(--text-muted)]'>Loading…</p>
              ) : !editing && status && rules ? (
                <>
                  <div className='flex items-center justify-between'>
                    <div className='text-sm text-[var(--text-secondary)]'>
                      {rules.firm || 'Challenge'}
                      {rules.phase ? ` · ${rules.phase}` : ''} · size{' '}
                      {fmt(status.accountSize)}
                    </div>
                    {statusChip(status.status)}
                  </div>

                  <div className='text-xs text-[var(--text-muted)]'>
                    Balance {fmt(status.currentBalance)}. Net P&amp;L{' '}
                    {fmt(status.netProfit)}.
                  </div>

                  {renderObjectives(status, rules)}

                  <button
                    className='text-xs text-[var(--accent)] hover:opacity-80'
                    onClick={() => setEditing(true)}>
                    Edit rules
                  </button>
                </>
              ) : (
                <>
                  <p className='text-sm text-[var(--text-secondary)]'>
                    Enter your challenge rules. Percentages are of the account
                    size. Leave a field blank to skip that rule.
                  </p>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Firm'>
                      <input
                        className={inputClass}
                        value={firm}
                        onChange={(e) => setFirm(e.target.value)}
                        placeholder='FundingPips'
                      />
                    </Field>
                    <Field label='Phase'>
                      <input
                        className={inputClass}
                        value={phase}
                        onChange={(e) => setPhase(e.target.value)}
                        placeholder='Phase 1'
                      />
                    </Field>
                    <Field label='Account size'>
                      <input
                        className={inputClass}
                        value={accountSize}
                        onChange={(e) => setAccountSize(e.target.value)}
                        inputMode='decimal'
                        placeholder={String(startingBalance || 10000)}
                      />
                    </Field>
                    <Field label='Profit target %'>
                      <input
                        className={inputClass}
                        value={profitTargetPct}
                        onChange={(e) => setProfitTargetPct(e.target.value)}
                        inputMode='decimal'
                        placeholder='8'
                      />
                    </Field>
                    <Field label='Max drawdown %'>
                      <input
                        className={inputClass}
                        value={maxDrawdownPct}
                        onChange={(e) => setMaxDrawdownPct(e.target.value)}
                        inputMode='decimal'
                        placeholder='10'
                      />
                    </Field>
                    <Field label='Drawdown type'>
                      <select
                        className={inputClass}
                        value={maxDrawdownType}
                        onChange={(e) =>
                          setMaxDrawdownType(
                            e.target.value === 'trailing' ? 'trailing' : 'static',
                          )
                        }>
                        <option value='static'>Static</option>
                        <option value='trailing'>Trailing</option>
                      </select>
                    </Field>
                    <Field label='Daily loss %'>
                      <input
                        className={inputClass}
                        value={dailyLossPct}
                        onChange={(e) => setDailyLossPct(e.target.value)}
                        inputMode='decimal'
                        placeholder='5'
                      />
                    </Field>
                    <Field label='Min trading days'>
                      <input
                        className={inputClass}
                        value={minTradingDays}
                        onChange={(e) => setMinTradingDays(e.target.value)}
                        inputMode='numeric'
                        placeholder='3'
                      />
                    </Field>
                    <Field label='Daily reset (UTC hour)'>
                      <input
                        className={inputClass}
                        value={dailyResetHourUtc}
                        onChange={(e) => setDailyResetHourUtc(e.target.value)}
                        inputMode='numeric'
                        placeholder='0 = UTC midnight'
                      />
                    </Field>
                  </div>
                  <p className='text-[11px] text-[var(--text-muted)]'>
                    Drawdown defaults to static. Daily reset is the UTC hour your
                    firm starts a new day: 0 is UTC midnight, around 22 is typical
                    for an EET broker-server midnight or New York 5pm.
                  </p>
                  <button
                    className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                    onClick={() => void save()}
                    disabled={busy}>
                    {busy ? 'Saving…' : 'Save rules'}
                  </button>
                </>
              )}

              {msg ? (
                <p className='rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]'>
                  {msg}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
