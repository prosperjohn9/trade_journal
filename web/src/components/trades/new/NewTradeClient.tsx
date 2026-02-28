'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/src/lib/utils/format';
import { useNewTrade } from '@/src/hooks/useNewTrade';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

const OUTCOME_TONES: Record<'WIN' | 'LOSS' | 'BREAKEVEN', string> = {
  WIN: 'var(--profit)',
  LOSS: 'var(--loss)',
  BREAKEVEN: 'var(--text-muted)',
};

const ACCOUNT_TYPE_TONES: Record<string, string> = {
  live: 'var(--profit)',
  demo: '#3b82f6',
  challenge: 'var(--accent)',
  funded: '#f59e0b',
  investor: 'var(--text-muted)',
};

function percentText(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function ratioText(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function outcomeTone(outcome: 'WIN' | 'LOSS' | 'BREAKEVEN'): string {
  return OUTCOME_TONES[outcome];
}

function accountTypeTone(accountType: string | undefined): string {
  if (!accountType) return 'var(--text-muted)';
  return ACCOUNT_TYPE_TONES[accountType.trim().toLowerCase()] ?? 'var(--text-muted)';
}

function executionTone(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score < 40) return 'var(--loss)';
  if (score < 70) return '#f59e0b';
  return 'var(--profit)';
}

function OutcomeBadge({ outcome }: { outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' }) {
  const tone = outcomeTone(outcome);

  return (
    <span
      className='inline-flex items-center rounded-[10px] border px-2.5 py-1 text-[11px] font-semibold tracking-[0.03em]'
      style={{
        color: `color-mix(in srgb, ${tone} 88%, var(--text-primary))`,
        borderColor: `color-mix(in srgb, ${tone} 36%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tone} 12%, var(--bg-surface))`,
      }}>
      {outcome === 'BREAKEVEN' ? 'BE' : outcome}
    </span>
  );
}

function AccountTypeBadge({ accountType }: { accountType: string | undefined }) {
  if (!accountType) {
    return <span className='text-xs text-[var(--text-muted)]'>—</span>;
  }

  const tone = accountTypeTone(accountType);
  return (
    <span
      className='inline-flex items-center rounded-[9px] border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.03em]'
      style={{
        color: `color-mix(in srgb, ${tone} 90%, var(--text-primary))`,
        borderColor: `color-mix(in srgb, ${tone} 34%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${tone} 13%, var(--bg-surface))`,
      }}>
      {accountType}
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
      <div className='mb-4'>
        <h2 className='text-lg font-semibold text-[var(--text-primary)]'>{title}</h2>
        {subtitle && (
          <p className='mt-1 text-sm text-[var(--text-muted)]'>{subtitle}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className='block space-y-1.5'>
      <div className='text-sm font-medium text-[var(--text-secondary)]'>{label}</div>
      {children}
      {hint && <div className='text-xs text-[var(--text-muted)]'>{hint}</div>}
    </label>
  );
}

export function NewTradeClient() {
  const router = useRouter();
  const s = useNewTrade();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [previewOpen, setPreviewOpen] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const checklistPercent = s.checklistScore ?? 0;
  const executionLabel = s.checklistScore === null ? '—' : `${s.checklistScore}%`;
  const executionAccent = executionTone(s.checklistScore);
  const accountImpactTone =
    s.pnlPercentNumber === null || Number.isNaN(s.pnlPercentNumber)
      ? undefined
      : s.pnlPercentNumber > 0
        ? 'var(--profit)'
        : s.pnlPercentNumber < 0
          ? 'var(--loss)'
          : undefined;

  const rTone =
    s.rMultiple === null || Number.isNaN(s.rMultiple)
      ? 'var(--text-muted)'
      : s.rMultiple > 0
        ? 'var(--profit)'
        : s.rMultiple < 0
          ? 'var(--loss)'
          : 'var(--text-secondary)';
  const rBorderMix = s.rMultiple !== null && s.rMultiple < 0 ? 44 : 34;
  const rBgMix = s.rMultiple !== null && s.rMultiple < 0 ? 18 : 8;

  const summaryInstrument = s.instrument || '—';
  const summaryRisk = Number.isFinite(s.riskAmount)
    ? formatMoney(Number(s.riskAmount || 0), s.selectedCurrency)
    : '—';
  const summaryPnl = formatMoney(Number(s.pnlAmount || 0), s.selectedCurrency);
  const summaryImpact = percentText(s.pnlPercentNumber);
  const summaryR = ratioText(s.rMultiple);
  const summaryExecution = s.checklistScore === null ? '—' : `${s.checklistScore}%`;
  const summaryStartingBalance = s.selectedAccount
    ? formatMoney(Number(s.selectedAccountBalance || 0), s.selectedCurrency)
    : '—';

  const riskPercentTextValue =
    s.riskPercentOfAccount === null || Number.isNaN(s.riskPercentOfAccount)
      ? '—'
      : `${s.riskPercentOfAccount.toFixed(2)}% of account`;
  const favoriteInstrumentSet = useMemo(
    () => new Set(s.favoriteInstruments),
    [s.favoriteInstruments],
  );
  const recentOnlyInstruments = useMemo(
    () =>
      s.recentInstruments.filter((symbol) => !favoriteInstrumentSet.has(symbol)),
    [favoriteInstrumentSet, s.recentInstruments],
  );

  const checksSnapshot = useMemo(
    () =>
      Object.entries(s.checks).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    [s.checks],
  );

  const draftSnapshot = useMemo(
    () =>
      JSON.stringify({
        openedAt: s.openedAt,
        accountId: s.accountId,
        instrument: s.instrument,
        direction: s.direction,
        outcome: s.outcome,
        templateId: s.templateId,
        checks: checksSnapshot,
        pnlAmount: s.pnlAmount,
        riskAmount: s.riskAmount,
        notes: s.notes,
        beforeFile: s.beforeFile
          ? `${s.beforeFile.name}:${s.beforeFile.size}:${s.beforeFile.lastModified}`
          : '',
      }),
    [
      checksSnapshot,
      s.accountId,
      s.beforeFile,
      s.direction,
      s.instrument,
      s.notes,
      s.openedAt,
      s.outcome,
      s.pnlAmount,
      s.riskAmount,
      s.templateId,
    ],
  );

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        return;
      }

      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      setTheme(prefersDark ? 'dark' : 'light');
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (!s.initialized || !s.checklistLoaded) return;

    if (initialSnapshotRef.current === null) {
      initialSnapshotRef.current = draftSnapshot;
      return;
    }

    const nextHasUnsaved = initialSnapshotRef.current !== draftSnapshot;
    if (nextHasUnsaved !== hasUnsavedChanges) {
      setHasUnsavedChanges(nextHasUnsaved);
    }
  }, [draftSnapshot, hasUnsavedChanges, s.checklistLoaded, s.initialized]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges || s.saving) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [hasUnsavedChanges, s.saving]);

  function canLeaveSafely(): boolean {
    if (!hasUnsavedChanges || s.saving) return true;
    return window.confirm('You have unsaved changes. Leave without saving?');
  }

  function navigateWithGuard(path: string) {
    if (!canLeaveSafely()) return;
    router.push(path);
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      {previewOpen && s.beforePreviewUrl && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <button
            type='button'
            className='absolute inset-0 bg-black/75'
            onClick={() => setPreviewOpen(false)}
            aria-label='Close full screen preview'
          />
          <div className='relative w-full max-w-6xl rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-3'>
            <div className='flex justify-end'>
              <button
                type='button'
                className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={() => setPreviewOpen(false)}>
                Close
              </button>
            </div>
            <div className='mt-2 flex max-h-[84vh] items-center justify-center overflow-auto'>
              <Image
                src={s.beforePreviewUrl}
                alt='Before-trade screenshot full preview'
                width={1800}
                height={1100}
                unoptimized
                className='h-auto max-h-[80vh] w-auto rounded-lg'
              />
            </div>
          </div>
        </div>
      )}

      <div className='mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-[2.1rem] font-semibold tracking-tight'>Add Trade</h1>
            <p className='mt-1 text-sm text-[var(--text-muted)]'>
              Capture execution quality and performance in one place.
            </p>
          </div>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            onClick={() => navigateWithGuard('/dashboard')}>
            Back
          </button>
        </header>

        {!s.hasAccounts && (
          <div className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4 text-sm text-[var(--text-secondary)]'>
            <div className='font-semibold text-[var(--text-primary)]'>No accounts found</div>
            <div className='mt-1'>
              You need at least one account before adding trades.
            </div>
            <button
              className='mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm transition-colors hover:bg-[var(--bg-subtle)]'
              onClick={() => navigateWithGuard('/settings/accounts')}>
              Go to Accounts
            </button>
          </div>
        )}

        <form onSubmit={s.onSaveTrade}>
          <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]'>
            <div className='space-y-6'>
              <SectionCard
                title='Trade Context'
                subtitle='Core trade facts and setup selection.'>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <div className='space-y-4'>
                    <Field
                      label='Account'
                      hint='Trades must belong to an account.'>
                      <select
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        value={s.accountId}
                        onChange={(e) => s.setAccountId(e.target.value)}
                        disabled={!s.hasAccounts}>
                        {!s.hasAccounts && <option value=''>No accounts</option>}
                        {s.accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.is_default ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label='Instrument'>
                      <input
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        list='instrument-options'
                        value={s.instrument}
                        onChange={(e) => s.setInstrument(e.target.value)}
                        placeholder='Search or type symbol'
                        required
                      />
                      <datalist id='instrument-options'>
                        {s.instrumentSuggestions.map((symbol) => (
                          <option key={symbol} value={symbol} />
                        ))}
                      </datalist>

                      <div className='mt-2 flex flex-wrap gap-1.5'>
                        {s.favoriteInstruments.map((symbol) => {
                          const isSelected = s.instrument === symbol;
                          return (
                            <button
                              key={`fav-${symbol}`}
                              type='button'
                              className='rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors'
                              style={
                                isSelected
                                  ? {
                                      borderColor:
                                        'color-mix(in srgb, var(--accent) 48%, transparent)',
                                      backgroundColor:
                                        'color-mix(in srgb, var(--accent) 20%, var(--bg-surface))',
                                      color:
                                        'color-mix(in srgb, var(--accent) 90%, var(--text-primary))',
                                      boxShadow:
                                        '0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent)',
                                    }
                                  : {
                                      borderColor: 'var(--border-default)',
                                      backgroundColor: 'var(--bg-surface)',
                                      color: 'var(--text-secondary)',
                                    }
                              }
                              onClick={() => s.setInstrument(symbol)}>
                              {symbol}
                            </button>
                          );
                        })}
                        {recentOnlyInstruments.map((symbol) => {
                          const isSelected = s.instrument === symbol;
                          return (
                            <button
                              key={`recent-${symbol}`}
                              type='button'
                              className='rounded-full border px-2.5 py-1 text-[11px] transition-colors'
                              style={
                                isSelected
                                  ? {
                                      borderColor:
                                        'color-mix(in srgb, var(--accent) 48%, transparent)',
                                      backgroundColor:
                                        'color-mix(in srgb, var(--accent) 16%, var(--bg-surface))',
                                      color:
                                        'color-mix(in srgb, var(--accent) 88%, var(--text-primary))',
                                    }
                                  : {
                                      borderColor: 'var(--border-default)',
                                      backgroundColor: 'var(--bg-surface)',
                                      color: 'var(--text-muted)',
                                    }
                              }
                              onClick={() => s.setInstrument(symbol)}>
                              {symbol}
                            </button>
                          );
                        })}
                      </div>
                    </Field>

                    <Field label='Date/Time'>
                      <input
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        type='datetime-local'
                        value={s.openedAt}
                        onChange={(e) => s.setOpenedAt(e.target.value)}
                        required
                      />
                    </Field>
                  </div>

                  <div className='space-y-4'>
                    <Field label='Direction'>
                      <div className='grid grid-cols-2 gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1'>
                        {(['BUY', 'SELL'] as const).map((value) => {
                          const active = s.direction === value;
                          return (
                            <button
                              key={value}
                              type='button'
                              className='rounded-md px-3 py-2 text-sm font-semibold transition-all duration-200 ease-out'
                              style={
                                active
                                  ? {
                                      backgroundColor:
                                        'color-mix(in srgb, var(--accent) 16%, var(--bg-surface))',
                                      color: 'var(--accent)',
                                      transform: 'translateY(-1px)',
                                      boxShadow:
                                        '0 8px 16px -14px color-mix(in srgb, var(--accent) 68%, transparent)',
                                    }
                                  : { color: 'var(--text-secondary)' }
                              }
                              onClick={() => s.setDirection(value)}>
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </Field>

                    <Field label='Outcome'>
                      <div className='grid grid-cols-3 gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1'>
                        {(['WIN', 'LOSS', 'BREAKEVEN'] as const).map((value) => {
                          const tone = outcomeTone(value);
                          const active = s.outcome === value;

                          return (
                            <button
                              key={value}
                              type='button'
                              className='rounded-md border px-2 py-2 text-sm font-semibold transition-all duration-200 ease-out'
                              style={{
                                color: active
                                  ? `color-mix(in srgb, ${tone} 90%, var(--text-primary))`
                                  : `color-mix(in srgb, ${tone} 70%, var(--text-secondary))`,
                                borderColor: active
                                  ? `color-mix(in srgb, ${tone} 42%, transparent)`
                                  : 'transparent',
                                backgroundColor: active
                                  ? `color-mix(in srgb, ${tone} 14%, var(--bg-surface))`
                                  : `color-mix(in srgb, ${tone} 6%, var(--bg-surface))`,
                                transform: active ? 'translateY(-1px)' : 'translateY(0px)',
                              }}
                              onClick={() => s.setOutcome(value)}>
                              {value === 'BREAKEVEN' ? 'BE' : value}
                            </button>
                          );
                        })}
                      </div>
                    </Field>

                    <Field label='Setup'>
                      <select
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        value={s.templateId}
                        onChange={(e) => s.setTemplateId(e.target.value)}>
                        {!s.templates.length && <option value=''>No setups yet</option>}
                        {s.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.is_default ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </SectionCard>

              <div className='space-y-4'>
                <SectionCard
                  title='Execution Quality'
                  subtitle='Checklist discipline and pre-trade context.'>
                  <div className='space-y-4'>
                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-sm text-[var(--text-secondary)]'>
                        Execution Score
                      </p>
                      <p
                        className='text-sm font-semibold'
                        style={{
                          color: `color-mix(in srgb, ${executionAccent} 88%, var(--text-primary))`,
                        }}>
                        {executionLabel}
                      </p>
                    </div>
                    <div className='mt-3 h-2 rounded-full bg-[var(--bg-subtle)]'>
                      <div
                        className='h-full rounded-full transition-all'
                        style={{
                          width: `${checklistPercent}%`,
                          background: `linear-gradient(90deg, color-mix(in srgb, ${executionAccent} 80%, transparent), color-mix(in srgb, ${executionAccent} 45%, transparent))`,
                        }}
                      />
                    </div>
                  </div>

                  {s.templateId && s.items.length > 0 ? (
                    <div className='space-y-2'>
                      {s.items.map((it) => (
                        <label
                          key={it.id}
                          className='flex items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5'>
                          <input
                            type='checkbox'
                            checked={!!s.checks[it.id]}
                            onChange={() => s.toggle(it.id)}
                          />
                          <span className='text-sm text-[var(--text-secondary)]'>
                            {it.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : s.templateId ? (
                    <div className='text-sm text-[var(--text-muted)]'>
                      This setup has no active checklist items.
                    </div>
                  ) : (
                    <div className='text-sm text-[var(--text-muted)]'>
                      Create a setup in{' '}
                      <button
                        type='button'
                        className='underline'
                        onClick={() => navigateWithGuard('/settings/setups')}>
                        Settings → Setups
                      </button>
                      .
                    </div>
                  )}

                  <div className='text-xs text-[var(--text-muted)]'>
                    Manage setups in{' '}
                    <button
                      type='button'
                      className='underline'
                      onClick={() => navigateWithGuard('/settings/setups')}>
                      Settings → Setups
                    </button>
                  </div>

                  <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
                    <div className='font-semibold text-[var(--text-primary)]'>
                      Before-Trade Screenshot
                    </div>
                    <div className='mt-1 text-sm text-[var(--text-muted)]'>
                      Upload your setup screenshot.
                    </div>

                    <input
                      className='mt-3 block text-sm text-[var(--text-secondary)]'
                      type='file'
                      accept='image/*'
                      onChange={(e) =>
                        s.onBeforeFileChange(e.target.files?.[0] ?? null)
                      }
                    />

                    <div className='mt-2 text-xs text-[var(--text-muted)]'>
                      {s.beforeFile
                        ? `Selected: ${s.beforeFile.name}`
                        : 'No screenshot selected.'}
                    </div>

                    {s.beforePreviewUrl && (
                      <button
                        type='button'
                        className='mt-3 block text-left'
                        onClick={() => setPreviewOpen(true)}>
                        <Image
                          src={s.beforePreviewUrl}
                          alt='Before screenshot preview'
                          width={1200}
                          height={700}
                          unoptimized
                          className='max-h-64 w-auto rounded-lg border border-[var(--border-default)] transition-opacity hover:opacity-90'
                        />
                        <span className='mt-1 block text-xs text-[var(--text-muted)]'>
                          Click to open full-screen preview
                        </span>
                      </button>
                    )}
                  </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title='Performance Metrics'
                  subtitle='Capture risk and result. P&L % is derived automatically.'>
                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
                    <Field label='P&L ($)'>
                      <input
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        type='number'
                        step='0.01'
                        value={s.pnlAmount}
                        onChange={(e) => s.setPnlAmount(e.target.value)}
                        required
                      />
                    </Field>
                  </div>

                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
                    <Field label='P&L (%) (Auto)'>
                      <input
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3 text-sm font-semibold text-[var(--text-primary)]'
                        value={percentText(s.pnlPercentNumber)}
                        readOnly
                        tabIndex={-1}
                      />
                    </Field>
                  </div>

                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
                    <Field label='Risk ($)'>
                      <input
                        className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        type='number'
                        step='0.01'
                        min='0'
                        value={s.riskAmount}
                        onChange={(e) => s.setRiskAmount(Number(e.target.value))}
                      />
                      <div className='text-xs text-[var(--text-muted)]'>
                        {riskPercentTextValue}
                      </div>
                    </Field>
                  </div>

                  <div
                    className='rounded-lg border p-3'
                    style={{
                      borderColor: `color-mix(in srgb, ${rTone} ${rBorderMix}%, var(--border-default))`,
                      backgroundColor: `color-mix(in srgb, ${rTone} ${rBgMix}%, var(--bg-surface))`,
                    }}>
                    <div className='text-sm font-medium text-[var(--text-secondary)]'>
                      R-Multiple
                    </div>
                    <div
                      className='mt-1 text-4xl font-semibold leading-none'
                      style={{
                        color: `color-mix(in srgb, ${rTone} 88%, var(--text-primary))`,
                      }}>
                      {ratioText(s.rMultiple)}
                    </div>
                  </div>
                  </div>

                  {s.riskExceedsPolicy && (
                    <div
                      className='mt-3 rounded-lg border px-3 py-2 text-sm'
                      style={{
                        borderColor:
                          'color-mix(in srgb, var(--loss) 32%, var(--border-default))',
                        backgroundColor:
                          'color-mix(in srgb, var(--loss) 10%, var(--bg-surface))',
                        color: 'color-mix(in srgb, var(--loss) 88%, var(--text-primary))',
                      }}>
                      ⚠ Risk exceeds your defined max risk ({s.maxRiskPercent}% of account).
                    </div>
                  )}

                  <div className='mt-4'>
                    <Field label='Notes'>
                      <textarea
                        className='min-h-28 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
                        value={s.notes}
                        onChange={(e) => s.setNotes(e.target.value)}
                        placeholder='Trade context, execution notes, mistakes, ideas...'
                      />
                    </Field>
                  </div>
                </SectionCard>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
                <div className='text-sm text-[var(--text-muted)]'>
                  {s.msg ||
                    (hasUnsavedChanges
                      ? 'Unsaved changes'
                      : 'All changes saved')}
                </div>
                <button
                  className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                  disabled={s.saving || !s.canSave}
                  style={
                    hasUnsavedChanges && !s.saving && s.canSave
                      ? {
                          boxShadow:
                            '0 0 0 1px color-mix(in srgb, var(--accent-cta) 20%, transparent), 0 0 24px -10px color-mix(in srgb, var(--accent-cta) 90%, transparent)',
                        }
                      : undefined
                  }>
                  {s.saving ? 'Saving...' : 'Save Trade'}
                </button>
              </div>
            </div>

            <aside className='xl:sticky xl:top-6 xl:self-start'>
              <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5'>
                <div className='text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'>
                  Trade Summary
                </div>

                <div className='mt-3 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]'>
                  <span>{summaryInstrument}</span>
                  <span className='text-[var(--text-muted)]'>•</span>
                  <span>{s.direction}</span>
                </div>

                <div className='mt-2 flex items-center gap-2'>
                  <OutcomeBadge outcome={s.outcome} />
                  <AccountTypeBadge accountType={s.selectedAccount?.account_type} />
                </div>

                <div className='mt-4 space-y-2 text-sm'>
                  <SummaryRow label='Account' value={s.selectedAccount?.name ?? '—'} />
                  <SummaryRow label='Starting Balance' value={summaryStartingBalance} />
                  <SummaryRow label='Risk' value={summaryRisk} />
                  <SummaryRow label='Result' value={summaryR} />
                  <SummaryRow label='P&L' value={summaryPnl} />
                  <SummaryRow
                    label='Account Impact'
                    value={summaryImpact}
                    tone={accountImpactTone}
                  />
                  <SummaryRow
                    label='Execution Score'
                    value={summaryExecution}
                    tone={executionAccent}
                  />
                </div>
              </section>
            </aside>
          </div>
        </form>
      </div>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className='text-[var(--text-secondary)]'>{label}</span>
      <span
        className='font-semibold'
        style={{ color: tone ? `color-mix(in srgb, ${tone} 88%, var(--text-primary))` : 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  );
}