'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeView, type TradeChecklistItem } from '@/src/hooks/useTradeView';
import { formatMoney } from '@/src/lib/utils/format';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

const OUTCOME_TONES: Record<Outcome, string> = {
  WIN: 'var(--profit)',
  LOSS: 'var(--loss)',
  BREAKEVEN: 'var(--text-muted)',
};

function executionTone(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score < 40) return 'var(--loss)';
  if (score < 70) return '#f59e0b';
  return 'var(--profit)';
}

function signedPercent(value: number | null, digits = 2): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function signedR(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function scoreColorClass(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  return executionTone(score);
}

function NumericValue({
  value,
  tone,
}: {
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <span
      className='font-semibold tabular-nums'
      style={{
        color: tone
          ? `color-mix(in srgb, ${tone} 88%, var(--text-primary))`
          : 'var(--text-primary)',
      }}>
      {value}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='space-y-1'>
      <div className='text-xs font-medium uppercase tracking-[0.03em] text-[var(--text-muted)]'>
        {label}
      </div>
      <div className='text-[var(--text-primary)]'>{value}</div>
    </div>
  );
}

function MetaBadge({
  text,
  tone,
}: {
  text: string;
  tone?: string;
}) {
  return (
    <span
      className='inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.02em]'
      style={{
        color: tone
          ? `color-mix(in srgb, ${tone} 88%, var(--text-primary))`
          : 'var(--text-secondary)',
        borderColor: tone
          ? `color-mix(in srgb, ${tone} 34%, transparent)`
          : 'var(--border-default)',
        backgroundColor: tone
          ? `color-mix(in srgb, ${tone} 12%, var(--bg-surface))`
          : 'var(--bg-surface)',
      }}>
      {text}
    </span>
  );
}

function ChecklistColumn({
  title,
  items,
  tone,
  empty,
  marker,
}: {
  title: string;
  items: TradeChecklistItem[];
  tone: string;
  empty: string;
  marker: 'ok' | 'missed';
}) {
  return (
    <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
      <div className='mb-2 text-sm font-semibold text-[var(--text-primary)]'>{title}</div>

      {items.length ? (
        <ul className='space-y-2'>
          {items.map((item) => (
            <li
              key={item.id}
              className='flex items-start gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-muted)] px-2.5 py-2'>
              <div
                className='mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold'
                style={{
                  color: `color-mix(in srgb, ${tone} 86%, var(--text-primary))`,
                  borderColor: `color-mix(in srgb, ${tone} 34%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${tone} 12%, var(--bg-surface))`,
                }}>
                {marker === 'ok' ? '✓' : '✕'}
              </div>
              <span className='text-sm text-[var(--text-primary)]'>{item.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className='rounded-md border border-dashed border-[var(--border-default)] px-3 py-4 text-sm text-[var(--text-muted)]'>
          {empty}
        </div>
      )}
    </div>
  );
}

function ScreenshotCard({
  title,
  url,
  onOpen,
}: {
  title: string;
  url: string;
  onOpen: () => void;
}) {
  return (
    <div className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
      <div className='mb-3 text-base font-semibold text-[var(--text-primary)]'>{title}</div>

      {url ? (
        <button
          type='button'
          className='block w-full text-left'
          onClick={onOpen}>
          <div className='overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]'>
            <Image
              src={url}
              alt={title}
              width={1400}
              height={860}
              unoptimized
              className='max-h-80 w-auto transition-opacity hover:opacity-95'
            />
          </div>
          <div className='mt-2 text-xs text-[var(--text-muted)]'>
            Click to open full-size preview
          </div>
        </button>
      ) : (
        <div className='rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-8 text-center text-sm text-[var(--text-muted)]'>
          No screenshot uploaded.
        </div>
      )}
    </div>
  );
}

function TimelineItem({
  title,
  value,
  isLast,
  complete,
}: {
  title: string;
  value: string;
  isLast?: boolean;
  complete: boolean;
}) {
  return (
    <li className='relative pl-6'>
      <span
        className='absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full'
        style={{ backgroundColor: complete ? 'var(--accent)' : 'var(--neutral-badge)' }}
      />
      {!isLast && (
        <span
          className='absolute left-[4px] top-4 h-[calc(100%-8px)] w-px'
          style={{ backgroundColor: 'var(--border-default)' }}
        />
      )}
      <div className='text-sm font-semibold text-[var(--text-primary)]'>{title}</div>
      <div className='text-xs text-[var(--text-muted)]'>{value}</div>
    </li>
  );
}

export function TradeViewClient() {
  const router = useRouter();
  const s = useTradeView();

  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

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

  if (!s.trade) {
    return (
      <main
        className='dashboard-theme min-h-screen bg-[var(--bg-app)] p-6 text-[var(--text-primary)]'
        data-theme={theme}>
        <p className='text-sm text-[var(--text-secondary)]'>{s.msg || 'Loading…'}</p>

        <button
          className='mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </main>
    );
  }

  const t = s.trade;

  const currency = t.account?.base_currency ?? 'USD';
  const pnlAmount = Number(t.pnl_amount ?? 0);
  const pnlPercent = Number(t.pnl_percent ?? 0);
  const rMultiple = t.r_multiple === null ? null : Number(t.r_multiple);

  const balanceBeforeRaw =
    Number.isFinite(pnlAmount) && Number.isFinite(pnlPercent) && pnlPercent !== 0
      ? pnlAmount / (pnlPercent / 100)
      : null;
  const balanceBefore =
    balanceBeforeRaw !== null && Number.isFinite(balanceBeforeRaw)
      ? balanceBeforeRaw
      : null;
  const balanceAfter =
    balanceBefore !== null && Number.isFinite(pnlAmount)
      ? balanceBefore + pnlAmount
      : null;

  const executionScore = s.activeItems.length
    ? Math.max(0, Math.min(100, Math.round(s.adherence.pct)))
    : null;
  const executionAccent = scoreColorClass(executionScore);

  const followed = s.activeItems.filter((item) => !!s.checks[item.id]);
  const missed = s.activeItems.filter((item) => !s.checks[item.id]);

  const pnlTone =
    pnlAmount > 0 ? 'var(--profit)' : pnlAmount < 0 ? 'var(--loss)' : undefined;
  const impactTone =
    pnlPercent > 0 ? 'var(--profit)' : pnlPercent < 0 ? 'var(--loss)' : undefined;
  const rTone =
    rMultiple === null
      ? undefined
      : rMultiple > 0
        ? 'var(--profit)'
        : rMultiple < 0
          ? 'var(--loss)'
          : undefined;

  const grossPnl = Number(t.pnl_amount ?? 0);
  const netPnl = Number.isFinite(s.netPnl) ? Number(s.netPnl) : Number(t.net_pnl ?? 0);

  const timelineExit = t.closed_at
    ? new Date(t.closed_at).toLocaleString()
    : 'Not recorded';
  const timelineReview = t.reviewed_at
    ? new Date(t.reviewed_at).toLocaleString()
    : 'Not reviewed yet';

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      {preview && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <button
            type='button'
            className='absolute inset-0 bg-black/70'
            onClick={() => setPreview(null)}
            aria-label='Close screenshot preview'
          />
          <div className='relative w-full max-w-6xl rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-3'>
            <div className='flex items-center justify-between gap-3'>
              <div className='text-sm font-semibold text-[var(--text-primary)]'>
                {preview.title}
              </div>
              <button
                type='button'
                className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
            <div className='mt-3 flex max-h-[82vh] items-center justify-center overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2'>
              <Image
                src={preview.url}
                alt={preview.title}
                width={1800}
                height={1100}
                unoptimized
                className='h-auto max-h-[78vh] w-auto rounded'
              />
            </div>
          </div>
        </div>
      )}

      <div className='mx-auto w-full max-w-[1280px] space-y-6 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h1 className='text-[2.1rem] font-semibold tracking-tight'>Trade Details</h1>
            <p className='mt-1 text-sm text-[var(--text-muted)]'>
              {t.instrument} • {new Date(t.opened_at).toLocaleString()}
            </p>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              onClick={() => router.push(`/trades/${t.id}/edit`)}>
              Edit Trade
            </button>

            <button
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              onClick={() => router.push('/dashboard')}>
              Back
            </button>
          </div>
        </header>

        <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
          <div className='flex flex-wrap items-start justify-between gap-5'>
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <MetaBadge text={t.direction} tone='var(--accent)' />
                <MetaBadge text={t.outcome === 'BREAKEVEN' ? 'BE' : t.outcome} tone={OUTCOME_TONES[t.outcome]} />
                <MetaBadge text={t.account?.name ?? 'No account'} />
                {t.account?.account_type ? (
                  <MetaBadge text={t.account.account_type} />
                ) : null}
              </div>

              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5'>
                  <div className='text-xs text-[var(--text-muted)]'>R Multiple</div>
                  <div className='mt-1 text-xl'>
                    <NumericValue value={signedR(rMultiple)} tone={rTone} />
                  </div>
                </div>
                <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5'>
                  <div className='text-xs text-[var(--text-muted)]'>Account Impact</div>
                  <div className='mt-1 text-xl'>
                    <NumericValue value={signedPercent(pnlPercent)} tone={impactTone} />
                  </div>
                </div>
                <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5'>
                  <div className='text-xs text-[var(--text-muted)]'>P&L</div>
                  <div className='mt-1 text-xl'>
                    <NumericValue value={formatMoney(pnlAmount, currency)} tone={pnlTone} />
                  </div>
                </div>
              </div>
            </div>

            <div className='w-full min-w-[220px] max-w-[320px] rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
              <div className='text-xs font-semibold uppercase tracking-[0.03em] text-[var(--text-muted)]'>
                Execution Score
              </div>
              <div className='mt-1 flex items-center justify-between gap-2'>
                <div
                  className='text-lg font-semibold tabular-nums'
                  style={{
                    color: `color-mix(in srgb, ${executionAccent} 88%, var(--text-primary))`,
                  }}>
                  {executionScore === null ? '—' : `${executionScore}%`}
                </div>
                <MetaBadge
                  text={s.isReviewed ? 'Reviewed' : 'Not reviewed'}
                  tone={s.isReviewed ? 'var(--accent)' : 'var(--text-muted)'}
                />
              </div>
              <div className='mt-2 h-2 rounded-full bg-[var(--bg-subtle)]'>
                <div
                  className='h-full rounded-full transition-all duration-500'
                  style={{
                    width: `${executionScore ?? 0}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${executionAccent} 80%, transparent), color-mix(in srgb, ${executionAccent} 45%, transparent))`,
                  }}
                />
              </div>
              <div className='mt-2 text-xs text-[var(--text-muted)]'>
                {t.reviewed_at
                  ? `Reviewed on ${new Date(t.reviewed_at).toLocaleString()}`
                  : 'Pending review'}
              </div>
            </div>
          </div>
        </section>

        <div className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]'>
          <div className='space-y-6'>
            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
              <h2 className='text-xl font-semibold'>Entry</h2>

              <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2'>
                <DetailRow label='Account' value={t.account?.name ?? '—'} />
                <DetailRow
                  label='P&L ($)'
                  value={<NumericValue value={formatMoney(pnlAmount, currency)} tone={pnlTone} />}
                />
                <DetailRow
                  label='P&L (%)'
                  value={<NumericValue value={signedPercent(pnlPercent)} tone={impactTone} />}
                />
                <DetailRow
                  label='Risk ($)'
                  value={
                    t.risk_amount === null
                      ? '—'
                      : formatMoney(Number(t.risk_amount), currency)
                  }
                />
                <DetailRow
                  label='R Multiple'
                  value={<NumericValue value={signedR(rMultiple)} tone={rTone} />}
                />
              </div>

              {t.notes ? (
                <div className='mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
                  <div className='text-xs font-medium uppercase tracking-[0.03em] text-[var(--text-muted)]'>
                    Notes
                  </div>
                  <div className='mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]'>
                    {t.notes}
                  </div>
                </div>
              ) : null}

              <div
                className='mt-4 rounded-lg border p-3'
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--border-default) 72%, transparent)',
                  backgroundColor:
                    'color-mix(in srgb, var(--surface-muted) 86%, var(--bg-surface))',
                }}>
                <div className='text-sm font-semibold text-[var(--text-primary)]'>Trade Impact</div>
                <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3'>
                  <DetailRow
                    label='Balance Before'
                    value={
                      balanceBefore === null
                        ? '—'
                        : formatMoney(balanceBefore, currency)
                    }
                  />
                  <DetailRow
                    label='Balance After'
                    value={
                      balanceAfter === null
                        ? '—'
                        : formatMoney(balanceAfter, currency)
                    }
                  />
                  <DetailRow
                    label='% Change'
                    value={<NumericValue value={signedPercent(pnlPercent)} tone={impactTone} />}
                  />
                </div>
              </div>
            </section>

            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h2 className='text-xl font-semibold'>Setup Checklist</h2>
                {s.activeItems.length ? (
                  <div className='text-sm text-[var(--text-secondary)]'>
                    Adherence:{' '}
                    <span className='font-semibold text-[var(--text-primary)]'>
                      {s.adherence.checked}
                    </span>
                    /{s.adherence.total} ({Math.round(s.adherence.pct)}%) • Missed:{' '}
                    <span className='font-semibold text-[var(--text-primary)]'>
                      {s.adherence.missed}
                    </span>
                  </div>
                ) : (
                  <div className='text-sm text-[var(--text-muted)]'>No checklist rules.</div>
                )}
              </div>

              {s.activeItems.length > 0 ? (
                <div className='mt-4 grid grid-cols-1 gap-3 md:grid-cols-2'>
                  <ChecklistColumn
                    title='Followed'
                    items={followed}
                    tone='var(--profit)'
                    empty='No followed rules recorded.'
                    marker='ok'
                  />
                  <ChecklistColumn
                    title='Missed'
                    items={missed}
                    tone='var(--loss)'
                    empty='No missed rules. Great discipline.'
                    marker='missed'
                  />
                </div>
              ) : null}
            </section>

            <ScreenshotCard
              title='Before-Trade Screenshot'
              url={s.beforeUrl}
              onOpen={() => s.beforeUrl && setPreview({ url: s.beforeUrl, title: 'Before-Trade Screenshot' })}
            />

            {!s.isReviewed ? (
              <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
                <div className='rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
                  <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
                    This trade has not been reviewed yet.
                  </h2>
                  <p className='mt-1 text-sm text-[var(--text-secondary)]'>
                    Reviewing helps you analyze execution quality and discipline.
                  </p>
                  <button
                    className='mt-4 rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110'
                    onClick={() => router.push(`/trades/${t.id}/review`)}>
                    Review Trade
                  </button>
                </div>
              </section>
            ) : (
              <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
                <h2 className='text-xl font-semibold'>Review</h2>

                <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2'>
                  <DetailRow label='Entry Price' value={fmtNum(t.entry_price)} />
                  <DetailRow label='Stop Loss' value={fmtNum(t.stop_loss)} />
                  <DetailRow label='Take Profit' value={fmtNum(t.take_profit)} />
                  <DetailRow label='Exit Price' value={fmtNum(t.exit_price)} />
                  <DetailRow
                    label='Exit Date/Time'
                    value={t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}
                  />
                  <DetailRow label='Commission' value={fmtMoney(t.commission, currency)} />
                </div>

                <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
                    <div className='text-xs text-[var(--text-muted)]'>Gross P&L</div>
                    <div className='mt-1 text-xl'>
                      <NumericValue
                        value={formatMoney(grossPnl, currency)}
                        tone={grossPnl > 0 ? 'var(--profit)' : grossPnl < 0 ? 'var(--loss)' : undefined}
                      />
                    </div>
                  </div>
                  <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
                    <div className='text-xs text-[var(--text-muted)]'>Net P&L</div>
                    <div className='mt-1 text-xl'>
                      <NumericValue
                        value={formatMoney(netPnl, currency)}
                        tone={netPnl > 0 ? 'var(--profit)' : netPnl < 0 ? 'var(--loss)' : undefined}
                      />
                    </div>
                  </div>
                </div>

                <div className='mt-4'>
                  <ScreenshotCard
                    title='After-Trade Screenshot'
                    url={s.afterUrl}
                    onOpen={() =>
                      s.afterUrl &&
                      setPreview({ url: s.afterUrl, title: 'After-Trade Screenshot' })
                    }
                  />
                </div>

                <div className='mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
                  <h3 className='text-base font-semibold'>Reflection</h3>

                  <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2'>
                    <DetailRow
                      label='Emotion Tag'
                      value={
                        t.emotion_tag ? (
                          <MetaBadge text={t.emotion_tag} tone='var(--accent)' />
                        ) : (
                          '—'
                        )
                      }
                    />
                    <DetailRow
                      label='Lesson Learned'
                      value={t.lesson_learned ? t.lesson_learned : '—'}
                    />
                  </div>

                  {t.review_notes ? (
                    <div className='mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3'>
                      <div className='text-xs font-medium uppercase tracking-[0.03em] text-[var(--text-muted)]'>
                        Extra Notes
                      </div>
                      <div className='mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]'>
                        {t.review_notes}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            )}
          </div>

          <aside className='xl:sticky xl:top-6 xl:self-start'>
            <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
              <h3 className='text-sm font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'>
                Trade Timeline
              </h3>

              <ul className='mt-4 space-y-4'>
                <TimelineItem
                  title='Entry'
                  value={new Date(t.opened_at).toLocaleString()}
                  complete
                />
                <TimelineItem
                  title='Exit'
                  value={timelineExit}
                  complete={!!t.closed_at}
                />
                <TimelineItem
                  title='Review'
                  value={timelineReview}
                  complete={!!t.reviewed_at}
                  isLast
                />
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function fmtNum(n: number | null, digits = 5) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits);
}

function fmtMoney(n: number | null, currency: string) {
  if (n === null || n === undefined) return '—';
  return formatMoney(Number(n), currency);
}
