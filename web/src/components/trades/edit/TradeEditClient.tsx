'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  parseDirection,
  parseOutcome,
  useTradeEdit,
} from '@/src/hooks/useTradeEdit';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function formatTimelineDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className='block space-y-1'>
      <div className='text-sm text-[var(--text-secondary)]'>{label}</div>
      {children}
    </label>
  );
}

function AutoBadge() {
  return (
    <span className='inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-[var(--text-secondary)]'>
      Auto
    </span>
  );
}

function StatusBadge({
  text,
  tone,
}: {
  text: string;
  tone: string;
}) {
  return (
    <span
      className='inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold'
      style={{
        borderColor: `color-mix(in srgb, ${tone} 36%, var(--border-default))`,
        backgroundColor: `color-mix(in srgb, ${tone} 14%, var(--bg-surface))`,
        color: `color-mix(in srgb, ${tone} 88%, var(--text-primary))`,
      }}>
      {text}
    </span>
  );
}

export function TradeEditClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tradeId = params.id;
  const s = useTradeEdit();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const returnToParam = searchParams.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') ? returnToParam : null;

  const executionScore = s.activeItems.length
    ? `${Math.round(s.adherence.pct)}%`
    : '—';

  const editReturnPath = returnTo
    ? `/trades/${tradeId}/edit?returnTo=${encodeURIComponent(returnTo)}`
    : `/trades/${tradeId}/edit`;
  const reviewHref = `/trades/${tradeId}/review?returnTo=${encodeURIComponent(
    editReturnPath,
  )}`;
  const controlClass =
    'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';
  const buttonClass =
    'rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]';
  const saveButtonClass =
    'w-full rounded-lg border border-transparent bg-[var(--accent-cta)] p-3 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60';
  const handleReviewRoute = () => {
    if (!s.confirmDiscardChanges()) return;
    router.push(reviewHref);
  };

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

  if (s.loading) {
    return (
      <main
        className='dashboard-theme min-h-screen bg-[var(--bg-app)] p-6 text-[var(--text-primary)]'
        data-theme={theme}>
        <p className='text-sm text-[var(--text-secondary)]'>Loading...</p>
      </main>
    );
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto max-w-4xl space-y-6 px-6 py-6 pb-10'>
        <header className='flex items-center justify-between'>
          <h1 className='text-2xl font-semibold'>Edit Trade</h1>
          <button className={buttonClass} onClick={s.goBackSafe}>
            Cancel
          </button>
        </header>

        {/* 1) Trade Header */}
        <section className='space-y-1 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
          <div className='text-xl font-semibold'>
            {s.instrument} • {s.direction} • {s.outcome}
          </div>
          <div className='flex flex-wrap gap-2 pt-1'>
            {s.outcome === 'WIN' && <StatusBadge text='🟢 WIN' tone='var(--profit)' />}
            {s.outcome === 'LOSS' && <StatusBadge text='🔴 LOSS' tone='var(--loss)' />}
            {s.outcome === 'BREAKEVEN' && (
              <StatusBadge text='🟡 BE' tone='#f59e0b' />
            )}
            {s.reviewedAt ? (
              <StatusBadge text='🔵 Reviewed' tone='var(--accent)' />
            ) : (
              <StatusBadge text='🟠 Not Reviewed' tone='#f59e0b' />
            )}
          </div>
          <div className='text-sm text-[var(--text-secondary)]'>
            {s.selectedAccount?.name ?? 'Unknown account'}
          </div>
          <div className='text-sm text-[var(--text-muted)]'>
            {s.reviewedAt
              ? `Reviewed on ${new Date(s.reviewedAt).toLocaleString()}`
              : 'Not reviewed yet'}
          </div>

          <div className='mt-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
            <div className='mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'>
              Trade Timeline
            </div>
            <div className='grid grid-cols-1 gap-2 text-sm sm:grid-cols-3'>
              <TimelineItem
                label='Created'
                value={formatTimelineDate(s.openedAt)}
              />
              <TimelineItem
                label='Reviewed'
                value={s.reviewedAt ? formatTimelineDate(s.reviewedAt) : '○ Not reviewed'}
                muted={!s.reviewedAt}
              />
              <TimelineItem
                label='Last Edited'
                value={formatTimelineDate(s.reviewedAt ?? s.openedAt)}
              />
            </div>
          </div>
        </section>

        {!!s.msg && <p className='text-sm text-[var(--text-secondary)]'>{s.msg}</p>}
        {!!s.entryMsg && (
          <div className={`text-sm border rounded-lg p-3 ${s.entryMsgClasses}`}>
            {s.entryMsg}
          </div>
        )}

        <form onSubmit={s.saveEntry} className='space-y-4'>
          {/* 2) Core Trade Details */}
          <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
            <h2 className='font-semibold'>Trade Details</h2>

            <Field label='Account'>
              <select
                className={controlClass}
                value={s.accountId}
                onChange={(e) => s.setAccountId(e.target.value)}
                disabled={!s.hasAccounts && !s.accountId}>
                {!s.hasAccounts && !s.accountId && (
                  <option value=''>No accounts</option>
                )}
                {s.isCurrentAccountMissing && (
                  <option value={s.accountId}>Current account (unavailable)</option>
                )}
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
                className={controlClass}
                value={s.instrument}
                onChange={(e) => s.setInstrument(e.target.value.toUpperCase())}
                required
              />
            </Field>

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <Field label='Direction'>
                <select
                  className={controlClass}
                  value={s.direction}
                  onChange={(e) =>
                    s.setDirection(parseDirection(e.target.value))
                  }>
                  <option value='BUY'>BUY</option>
                  <option value='SELL'>SELL</option>
                </select>
              </Field>

              <Field label='Outcome'>
                <select
                  className={controlClass}
                  value={s.outcome}
                  onChange={(e) => s.setOutcome(parseOutcome(e.target.value))}>
                  <option value='WIN'>WIN</option>
                  <option value='LOSS'>LOSS</option>
                  <option value='BREAKEVEN'>BREAKEVEN</option>
                </select>
              </Field>
            </div>

            <Field label='Date/Time'>
              <input
                className={controlClass}
                type='datetime-local'
                value={s.openedAt}
                onChange={(e) => s.setOpenedAt(e.target.value)}
                required
              />
            </Field>

            <Field label='Setup Template'>
              <select
                className={controlClass}
                value={s.templateId ?? ''}
                onChange={(e) => s.setTemplateId(e.target.value || null)}>
                <option value=''>No setup</option>
                {s.isCurrentTemplateMissing && s.templateId && (
                  <option value={s.templateId}>Current setup (unavailable)</option>
                )}
                {s.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </section>

          {/* 3) Performance Metrics */}
          <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
            <div className='space-y-1'>
              <h2 className='font-semibold'>Performance Metrics</h2>
              <div className='text-xs text-[var(--text-muted)]'>
                Changes will update performance analytics.
              </div>
            </div>

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <Field label='Risk ($)'>
                <input
                  className={controlClass}
                  type='number'
                  step='0.01'
                  value={s.riskAmount}
                  onChange={(e) => s.setRiskAmount(Number(e.target.value))}
                />
              </Field>

              <Field label='P&L ($)'>
                <input
                  className={controlClass}
                  type='number'
                  step='0.01'
                  value={s.pnlAmount}
                  onChange={(e) => s.setPnlAmount(e.target.value)}
                  required
                />
              </Field>

              <Field
                label={
                  <span className='inline-flex items-center gap-2'>
                    P&L (%) <AutoBadge />
                  </span>
                }>
                <input
                  className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3 text-[var(--text-primary)]'
                  value={pct(s.pnlPercentAuto)}
                  readOnly
                  tabIndex={-1}
                />
              </Field>

              <Field
                label={
                  <span className='inline-flex items-center gap-2'>
                    R-Multiple <AutoBadge />
                  </span>
                }>
                <input
                  className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3 text-[var(--text-primary)]'
                  value={
                    s.rMultiple === null || Number.isNaN(s.rMultiple)
                      ? '—'
                      : `${s.rMultiple > 0 ? '+' : ''}${s.rMultiple.toFixed(2)}R`
                  }
                  readOnly
                  tabIndex={-1}
                />
              </Field>
            </div>
          </section>

          {/* 4) Screenshots */}
          <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
            <h2 className='font-semibold'>Screenshots</h2>
            {s.reviewedAt && (
              <div className='text-xs text-[var(--text-muted)]'>
                Screenshots can be updated without affecting review.
              </div>
            )}

            <ScreenshotEditor
              title='Before-Trade Screenshot'
              signedUrl={s.beforeSignedUrl}
              previewUrl={s.beforePreviewUrl}
              onOpen={() => s.openFull(s.beforeSignedUrl)}
              onFileChange={(file) => s.setBeforeFileWithPreview(file)}
            />

            <ScreenshotEditor
              title='After-Trade Screenshot'
              signedUrl={s.afterSignedUrl}
              previewUrl={s.afterPreviewUrl}
              onOpen={() => s.openFull(s.afterSignedUrl)}
              onFileChange={(file) => s.setAfterFileWithPreview(file)}
            />
          </section>

          {/* 5) Review Section (Conditional) */}
          <section
            className='space-y-3 rounded-xl border p-4'
            style={
              s.reviewedAt
                ? {
                    borderColor:
                      'color-mix(in srgb, var(--text-muted) 26%, var(--border-default))',
                    backgroundColor:
                      'color-mix(in srgb, var(--text-muted) 8%, var(--surface-elevated))',
                  }
                : {
                    borderColor:
                      'color-mix(in srgb, #f59e0b 40%, var(--border-default))',
                    backgroundColor:
                      'color-mix(in srgb, #f59e0b 10%, var(--surface-elevated))',
                  }
            }>
            {s.reviewedAt ? (
              <>
                <div className='text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'>
                  Review Snapshot
                </div>
                <div className='grid grid-cols-1 gap-3 text-sm md:grid-cols-2'>
                  <ReadOnlyField label='Execution Score' value={executionScore} />
                  <ReadOnlyField label='Emotion Tag' value={s.emotionTag || '—'} />
                  <ReadOnlyField
                    label='Lesson Learned'
                    value={s.lessonLearned || '—'}
                  />
                  <ReadOnlyField
                    label='Review Notes'
                    value={s.reviewNotes || '—'}
                  />
                </div>
                <button
                  type='button'
                  className={buttonClass}
                  onClick={handleReviewRoute}>
                  Edit Review
                </button>
              </>
            ) : (
              <div className='space-y-2'>
                <h2 className='font-semibold'>Review</h2>
                <div className='text-sm text-[var(--text-secondary)]'>
                  This trade has not been reviewed yet.
                </div>
                <button
                  type='button'
                  className={buttonClass}
                  onClick={handleReviewRoute}>
                  Complete Review
                </button>
              </div>
            )}
          </section>

          <div className='text-sm text-[var(--text-muted)]'>
            {s.isDirty ? 'Unsaved changes' : 'All changes saved'}
          </div>

          <button
            className={saveButtonClass}
            type='submit'
            disabled={!s.accountId || !s.isDirty}>
            Save Changes
          </button>
        </form>
      </div>
    </main>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className='space-y-1'>
      <div className='text-xs text-[var(--text-muted)]'>{label}</div>
      <div className='rounded-lg border border-[var(--border-default)] bg-[var(--surface-muted)] p-3'>
        {value}
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className='rounded-md border border-[var(--border-default)] bg-[var(--surface-muted)] p-2.5'>
      <div className='text-[11px] text-[var(--text-muted)]'>{label}</div>
      <div
        className={`text-sm ${muted ? 'font-normal text-[var(--text-muted)]' : 'font-medium text-[var(--text-primary)]'}`}>
        {value}
      </div>
    </div>
  );
}

function ScreenshotEditor({
  title,
  signedUrl,
  previewUrl,
  onOpen,
  onFileChange,
}: {
  title: string;
  signedUrl: string;
  previewUrl: string;
  onOpen: () => void;
  onFileChange: (file: File | null) => void;
}) {
  const buttonClass =
    'rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]';

  return (
    <section className='space-y-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <div className='font-semibold'>{title}</div>
      <div className='text-sm text-[var(--text-muted)]'>
        Replace screenshot by selecting a new file (optional).
      </div>

      {signedUrl ? (
        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <div className='text-sm text-[var(--text-secondary)]'>Current screenshot</div>
            <button type='button' className={buttonClass} onClick={onOpen}>
              View Full
            </button>
          </div>
          <Image
            src={signedUrl}
            alt={title}
            width={1200}
            height={700}
            unoptimized
            className='max-h-64 w-auto cursor-pointer rounded-lg border border-[var(--border-default)]'
            onClick={onOpen}
            title='Click to view full screen'
          />
        </div>
      ) : (
        <div className='text-sm text-[var(--text-muted)]'>No current screenshot.</div>
      )}

      <input
        type='file'
        accept='image/*'
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      {previewUrl && (
        <div className='space-y-2'>
          <div className='text-sm text-[var(--text-secondary)]'>
            New screenshot preview (will replace on save)
          </div>
          <Image
            src={previewUrl}
            alt={`${title} preview`}
            width={1200}
            height={700}
            unoptimized
            className='max-h-64 w-auto rounded-lg border border-[var(--border-default)]'
          />
        </div>
      )}
    </section>
  );
}
