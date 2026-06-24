'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import {
  computePropStatus,
  type PropRules,
  type PropStatus,
} from '@/src/lib/analytics/propFirm';
import {
  penaltyLabel,
  type NewsRule,
  type NewsPenaltyKind,
} from '@/src/lib/analytics/newsRule';

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
  accountType,
  startingBalance,
  onChanged,
  autoOpen,
  onAutoOpened,
}: {
  accountId: string;
  accountType?: string;
  startingBalance: number;
  onChanged?: () => void;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  // A funded account has no profit target to "pass", just drawdown rules that can
  // breach it. So the funded form drops target / min days / phase / templates.
  const isFunded = (accountType ?? '').trim().toLowerCase() === 'funded';
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

  // High-impact news rule (drives Live Guard's news warnings + countdown).
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [newsBefore, setNewsBefore] = useState('5');
  const [newsAfter, setNewsAfter] = useState('5');
  const [newsPenalty, setNewsPenalty] = useState<NewsPenaltyKind>('breach');
  const [newsHaircut, setNewsHaircut] = useState('');

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
    const n = r.news;
    setNewsEnabled(!!n?.enabled);
    setNewsBefore(n?.minutesBefore != null ? String(n.minutesBefore) : '5');
    setNewsAfter(n?.minutesAfter != null ? String(n.minutesAfter) : '5');
    setNewsPenalty(n?.penalty?.kind ?? 'breach');
    setNewsHaircut(
      n?.penalty?.haircutPct != null ? String(n.penalty.haircutPct) : '',
    );
  }

  function resetNews() {
    setNewsEnabled(false);
    setNewsBefore('5');
    setNewsAfter('5');
    setNewsPenalty('breach');
    setNewsHaircut('');
  }

  // One-click starting templates for the most common two-step challenges.
  // Prop rules change often, so these are starting points to verify, not gospel.
  const PRESETS: Array<{
    name: string;
    firm: string;
    target: number;
    maxDD: number;
    daily: number;
  }> = [
    { name: 'FTMO', firm: 'FTMO', target: 10, maxDD: 10, daily: 5 },
    { name: 'FundingPips', firm: 'FundingPips', target: 8, maxDD: 10, daily: 5 },
    { name: 'FundedNext', firm: 'FundedNext', target: 8, maxDD: 10, daily: 5 },
    { name: 'Generic 2-step', firm: '', target: 8, maxDD: 10, daily: 5 },
  ];

  function applyPreset(p: (typeof PRESETS)[number]) {
    setFirm(p.firm);
    setPhase('Phase 1');
    setAccountSize(String(startingBalance > 0 ? startingBalance : 10000));
    setProfitTargetPct(String(p.target));
    setMaxDrawdownPct(String(p.maxDD));
    setDailyLossPct(String(p.daily));
    setMaxDrawdownType('static');
    setMinTradingDays('');
    setDailyResetHourUtc('');
    resetNews();
  }

  // Sensible starting point (FundingPips/FTMO two-step) so the form is never
  // empty; the user adjusts to their actual challenge.
  function fillDefaults() {
    setFirm('');
    setAccountSize(String(startingBalance > 0 ? startingBalance : 10000));
    setPhase('');
    setProfitTargetPct(isFunded ? '' : '8'); // funded has no profit target
    setMaxDrawdownPct('10');
    setDailyLossPct('5');
    setMinTradingDays('');
    setMaxDrawdownType('static');
    setDailyResetHourUtc('');
    resetNews();
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

  // Auto-open right after a prop/funded account is created (parent flips autoOpen
  // for the new account's id). One-shot: we clear the signal as we open.
  useEffect(() => {
    if (!autoOpen) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setMsg(null);
      setOpen(true);
      onAutoOpened?.();
      await loadAll();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  function numOrUndef(s: string): number | undefined {
    const n = Number(s);
    return s.trim() && Number.isFinite(n) ? n : undefined;
  }

  async function save() {
    setMsg(null);
    setBusy(true);
    try {
      const news: NewsRule | undefined = newsEnabled
        ? {
            enabled: true,
            minutesBefore: numOrUndef(newsBefore) ?? 5,
            minutesAfter: numOrUndef(newsAfter) ?? 5,
            penalty: {
              kind: newsPenalty,
              haircutPct:
                newsPenalty === 'profit_haircut'
                  ? (numOrUndef(newsHaircut) ?? null)
                  : null,
            },
          }
        : undefined;
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
        news,
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
      // Binding remaining: smaller of today's daily room and the overall buffer.
      const remaining = s.dailyRemainingToday ?? Math.max(0, limit - usedToday);
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
              <h3 className='text-base font-semibold'>
                {isFunded ? 'Funded account rules' : 'Prop-firm challenge'}
              </h3>
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

                  {rules.news?.enabled ? (
                    <div className='text-xs text-[var(--text-muted)]'>
                      News rule: no trades {rules.news.minutesBefore}m before to{' '}
                      {rules.news.minutesAfter}m after high-impact news (
                      {penaltyLabel(rules.news.penalty)}).
                    </div>
                  ) : null}

                  <button
                    className='text-xs text-[var(--accent)] hover:opacity-80'
                    onClick={() => setEditing(true)}>
                    Edit rules
                  </button>
                </>
              ) : (
                <>
                  <p className='text-sm text-[var(--text-secondary)]'>
                    {isFunded
                      ? 'Enter your funded account rules. A funded account has no profit target, just the drawdown limits that can breach it. Percentages are of the account size; leave a field blank to skip it.'
                      : 'Enter your challenge rules. Percentages are of the account size. Leave a field blank to skip that rule.'}
                  </p>
                  {!isFunded ? (
                    <div>
                      <div className='mb-1 text-[11px] font-medium text-[var(--text-muted)]'>
                        Quick start (Phase 1 templates, verify against your firm)
                      </div>
                      <div className='flex flex-wrap gap-1.5'>
                        {PRESETS.map((p) => (
                          <button
                            key={p.name}
                            type='button'
                            onClick={() => applyPreset(p)}
                            className='rounded-full border border-[var(--border-default)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-cta)] hover:text-[var(--text-primary)]'>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Firm'>
                      <input
                        className={inputClass}
                        value={firm}
                        onChange={(e) => setFirm(e.target.value)}
                        placeholder='FundingPips'
                      />
                    </Field>
                    {!isFunded ? (
                      <Field label='Phase'>
                        <input
                          className={inputClass}
                          value={phase}
                          onChange={(e) => setPhase(e.target.value)}
                          placeholder='Phase 1'
                        />
                      </Field>
                    ) : null}
                    <Field label='Account size'>
                      <input
                        className={inputClass}
                        value={accountSize}
                        onChange={(e) => setAccountSize(e.target.value)}
                        inputMode='decimal'
                        placeholder={String(startingBalance || 10000)}
                      />
                    </Field>
                    {!isFunded ? (
                      <Field label='Profit target %'>
                        <input
                          className={inputClass}
                          value={profitTargetPct}
                          onChange={(e) => setProfitTargetPct(e.target.value)}
                          inputMode='decimal'
                          placeholder='8'
                        />
                      </Field>
                    ) : null}
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
                    {!isFunded ? (
                      <Field label='Min trading days'>
                        <input
                          className={inputClass}
                          value={minTradingDays}
                          onChange={(e) => setMinTradingDays(e.target.value)}
                          inputMode='numeric'
                          placeholder='3'
                        />
                      </Field>
                    ) : null}
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

                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
                    <label className='flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]'>
                      <input
                        type='checkbox'
                        checked={newsEnabled}
                        onChange={(e) => setNewsEnabled(e.target.checked)}
                      />
                      High-impact news rule
                    </label>
                    <p className='mt-1 text-[11px] text-[var(--text-muted)]'>
                      No trading around red-folder news (Forex Factory). Live
                      Guard warns you and counts down to the window.
                    </p>
                    {newsEnabled ? (
                      <div className='mt-3 grid grid-cols-2 gap-3'>
                        <Field label='Minutes before'>
                          <input
                            className={inputClass}
                            value={newsBefore}
                            onChange={(e) => setNewsBefore(e.target.value)}
                            inputMode='numeric'
                            placeholder='5'
                          />
                        </Field>
                        <Field label='Minutes after'>
                          <input
                            className={inputClass}
                            value={newsAfter}
                            onChange={(e) => setNewsAfter(e.target.value)}
                            inputMode='numeric'
                            placeholder='5'
                          />
                        </Field>
                        <Field label='If broken'>
                          <select
                            className={inputClass}
                            value={newsPenalty}
                            onChange={(e) =>
                              setNewsPenalty(e.target.value as NewsPenaltyKind)
                            }>
                            <option value='breach'>Account breach</option>
                            <option value='void_trade'>Trade voided</option>
                            <option value='lose_all_profit'>
                              Lose all profit
                            </option>
                            <option value='profit_haircut'>
                              Lose % of profit
                            </option>
                          </select>
                        </Field>
                        {newsPenalty === 'profit_haircut' ? (
                          <Field label='Profit lost %'>
                            <input
                              className={inputClass}
                              value={newsHaircut}
                              onChange={(e) => setNewsHaircut(e.target.value)}
                              inputMode='numeric'
                              placeholder='40'
                            />
                          </Field>
                        ) : null}
                      </div>
                    ) : null}
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
