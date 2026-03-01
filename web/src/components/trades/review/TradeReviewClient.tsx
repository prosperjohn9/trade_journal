'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeReview } from '@/src/hooks/useTradeReview';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function executionTone(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score === 100) return 'var(--profit)';
  if (score >= 75) return '#f59e0b';
  if (score >= 50) return '#d97706';
  return 'var(--loss)';
}

export function TradeReviewClient() {
  const router = useRouter();
  const s = useTradeReview();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const checklistScore = Math.round(s.adherence.pct);
  const hasChecklist = s.adherence.total > 0;
  const lessonWordCount = s.lessonLearned.trim().split(/\s+/).filter(Boolean)
    .length;
  const lessonTooShort = s.lessonLearned.trim().length > 0 && lessonWordCount < 4;
  const hasCurrentScreenshot = !!(
    s.afterSignedUrl || s.trade?.after_trade_screenshot_url
  );
  const screenshotInputId = 'after-trade-screenshot-input';
  const scoreTone = executionTone(hasChecklist ? checklistScore : null);
  const controlClass =
    'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';
  const buttonClass =
    'rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]';

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

  if (s.loading && !s.trade) {
    return (
      <main
        className='dashboard-theme min-h-screen bg-[var(--bg-app)] p-6 text-[var(--text-primary)]'
        data-theme={theme}>
        <div className='text-sm text-[var(--text-secondary)]'>
          {s.msg || 'Loading...'}
        </div>
      </main>
    );
  }

  if (!s.trade) {
    return (
      <main
        className='dashboard-theme min-h-screen bg-[var(--bg-app)] p-6 text-[var(--text-primary)]'
        data-theme={theme}>
        <div className='space-y-3'>
          <div className='text-[var(--text-secondary)]'>{s.msg || 'Trade not found.'}</div>
          <button
            className={buttonClass}
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto max-w-4xl space-y-6 px-6 py-6 pb-28'>
        <header className='flex items-start justify-between gap-4'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold'>Review Trade</h1>
            <div className='text-sm text-[var(--text-secondary)]'>
              {s.trade.instrument} • {s.trade.direction} • {s.trade.outcome} •{' '}
              {new Date(s.trade.opened_at).toLocaleString()}
            </div>
            {!!s.msg && (
              <div className='text-sm text-[var(--text-secondary)]'>{s.msg}</div>
            )}
          </div>

          <div className='flex gap-2'>
            <button className={buttonClass} onClick={s.goBack}>
              Back
            </button>
          </div>
        </header>

        <section
          className='space-y-2 rounded-xl border border-[var(--border-strong)] p-4 shadow-sm'
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--accent) 9%, var(--surface-elevated))',
          }}>
          <h2 className='font-semibold'>Execution Score Preview</h2>
          <div className='text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]'>
            Execution Score
          </div>

          <div className='flex flex-wrap items-end gap-3'>
            <div
              className='text-5xl font-semibold leading-none tabular-nums sm:text-6xl'
              style={{
                color: `color-mix(in srgb, ${scoreTone} 90%, var(--text-primary))`,
              }}>
              {checklistScore}%
            </div>
            <div className='rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-secondary)]'>
              Live Preview
            </div>
          </div>

          <div className='text-sm text-[var(--text-secondary)]'>
            {!hasChecklist
              ? 'No checklist rules in the selected template.'
              : s.missedCount === 0
                ? `${s.adherence.checked}/${s.adherence.total} Rules Followed`
                : `${s.missedCount} Missed ${
                    s.missedCount === 1 ? 'Criterion' : 'Criteria'
                  }`}
          </div>
          <div className='text-xs text-[var(--text-muted)]'>
            Execution Score = checklist adherence only.
          </div>
        </section>

        {/* Setup checklist */}
        <section className='space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <h2 className='font-semibold'>Setup Checklist</h2>
            <div className='text-sm text-[var(--text-muted)]'>
              Mark each rule as followed or missed.
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <label className='space-y-1'>
              <div className='text-sm text-[var(--text-secondary)]'>Template</div>
              <select
                className={controlClass}
                value={s.templateId}
                onChange={(e) => s.setTemplateId(e.target.value)}>
                {!s.templates.length && (
                  <option value=''>No templates yet</option>
                )}
                {s.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className='flex items-end'>
              <button
                className={buttonClass}
                onClick={() => router.push('/settings/setups')}>
                Manage Setups
              </button>
            </div>
          </div>

          <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
            {s.activeItems.map((it) => {
              const followed = !!s.checks[it.id];
              const cardTone = followed ? 'var(--profit)' : 'var(--text-muted)';
              const followedTone = 'var(--profit)';
              const missedTone = 'var(--text-muted)';

              return (
                <article
                  key={it.id}
                  className='space-y-3 rounded-lg border p-3'
                  style={{
                    borderColor: `color-mix(in srgb, ${cardTone} 34%, var(--border-default))`,
                    backgroundColor: `color-mix(in srgb, ${cardTone} 9%, var(--surface-elevated))`,
                  }}>
                  <div className='text-sm font-medium leading-snug'>{it.label}</div>

                  <div className='grid grid-cols-2 gap-2'>
                    <button
                      type='button'
                      className='rounded-lg border px-3 py-2 text-sm'
                      style={{
                        borderColor: followed
                          ? `color-mix(in srgb, ${followedTone} 40%, var(--border-default))`
                          : 'var(--border-default)',
                        backgroundColor: followed
                          ? `color-mix(in srgb, ${followedTone} 16%, var(--bg-surface))`
                          : 'var(--bg-surface)',
                        color: followed
                          ? `color-mix(in srgb, ${followedTone} 88%, var(--text-primary))`
                          : 'var(--text-secondary)',
                        fontWeight: followed ? 600 : 400,
                      }}
                      onClick={() => s.setCheck(it.id, true)}>
                      ✔ Followed
                    </button>

                    <button
                      type='button'
                      className='rounded-lg border px-3 py-2 text-sm'
                      style={{
                        borderColor: !followed
                          ? `color-mix(in srgb, ${missedTone} 50%, var(--border-default))`
                          : 'var(--border-default)',
                        backgroundColor: !followed
                          ? `color-mix(in srgb, ${missedTone} 14%, var(--bg-surface))`
                          : 'var(--bg-surface)',
                        color: !followed
                          ? `color-mix(in srgb, ${missedTone} 86%, var(--text-primary))`
                          : 'var(--text-secondary)',
                        fontWeight: !followed ? 600 : 400,
                      }}
                      onClick={() => s.setCheck(it.id, false)}>
                      ✖ Missed
                    </button>
                  </div>
                </article>
              );
            })}

            {!!s.templateId && s.activeItems.length === 0 && (
              <div className='text-sm text-[var(--text-muted)]'>
                No active items in this template yet.
              </div>
            )}
          </div>

          {s.activeItems.length > 0 && (
            <div className='text-sm text-[var(--text-secondary)]'>
              Missed criteria:{' '}
              <span className='font-semibold text-[var(--text-primary)]'>
                {s.missedCount}
              </span>
            </div>
          )}
        </section>

        {/* Execution */}
        <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <h2 className='font-semibold'>Execution</h2>
            <div className='text-xs text-[var(--text-muted)]'>
              Fill the core prices first, then confirm exit details.
            </div>
          </div>

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <Field label='Entry Price'>
              <input
                className={controlClass}
                value={s.entryPrice}
                onChange={(e) => s.setEntryPrice(e.target.value)}
                inputMode='decimal'
                placeholder='e.g., 1.10250'
              />
            </Field>

            <Field label='Stop Loss'>
              <input
                className={controlClass}
                value={s.stopLoss}
                onChange={(e) => s.setStopLoss(e.target.value)}
                inputMode='decimal'
                placeholder='e.g., 1.10000'
              />
            </Field>
          </div>

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <Field label='Take Profit'>
              <input
                className={controlClass}
                value={s.takeProfit}
                onChange={(e) => s.setTakeProfit(e.target.value)}
                inputMode='decimal'
                placeholder='e.g., 1.11000'
              />
            </Field>

            <Field label='Exit Price'>
              <input
                className={controlClass}
                value={s.exitPrice}
                onChange={(e) => s.setExitPrice(e.target.value)}
                inputMode='decimal'
                placeholder='e.g., 1.10800'
              />
            </Field>
          </div>

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <Field label='Exit Date/Time'>
              <input
                className={controlClass}
                type='datetime-local'
                value={s.closedAt}
                onChange={(e) => s.setClosedAt(e.target.value)}
              />
            </Field>

            <Field label='Commission'>
              <input
                className={controlClass}
                value={s.commission}
                onChange={(e) => s.setCommission(e.target.value)}
                inputMode='decimal'
                placeholder='e.g., 6'
              />
            </Field>
          </div>

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <PnlMiniCard label='Gross P/L' value={s.grossPnl} />
            <PnlMiniCard label='Net P/L' value={s.netPnl} />
          </div>
        </section>

        {/* After-trade screenshot */}
        <section className='space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
          <h2 className='font-semibold'>After-Trade Screenshot</h2>

          {hasCurrentScreenshot ? (
            <div className='space-y-2'>
              {s.afterSignedUrl ? (
                <button
                  type='button'
                  className='w-fit rounded-lg border border-[var(--border-default)] p-2'
                  onClick={s.openAfterScreenshot}
                  title='Click to view full screenshot'>
                  <Image
                    src={s.afterSignedUrl}
                    alt='Current after-trade screenshot'
                    width={1200}
                    height={700}
                    unoptimized
                    className='max-h-64 w-auto rounded-lg cursor-pointer'
                  />
                </button>
              ) : (
                <div className='rounded-lg border border-[var(--border-default)] p-4 text-sm text-[var(--text-muted)]'>
                  Screenshot exists, but preview could not be loaded.
                </div>
              )}
            </div>
          ) : (
            <div className='rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-sm text-[var(--text-muted)]'>
              No screenshot uploaded.
            </div>
          )}

          <div className='space-y-2'>
            <label
              htmlFor={screenshotInputId}
              className='inline-flex cursor-pointer rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
              {hasCurrentScreenshot ? 'Replace Screenshot' : 'Upload Screenshot'}
            </label>
            <input
              id={screenshotInputId}
              className='hidden'
              type='file'
              accept='image/*'
              onChange={s.onAfterFileChange}
            />
          </div>

          {s.afterPreviewUrl && (
            <div className='space-y-2'>
              <div className='text-sm text-[var(--text-muted)]'>
                New screenshot preview (will replace on save)
              </div>
              <Image
                src={s.afterPreviewUrl}
                alt='After screenshot preview'
                width={1200}
                height={700}
                unoptimized
                className='max-h-64 w-auto rounded-lg border border-[var(--border-default)]'
              />
            </div>
          )}
        </section>

        {/* Reflection */}
        <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4'>
          <h2 className='font-semibold'>Reflection</h2>
          <div className='text-sm text-[var(--text-muted)]'>
            Describe what you did well or what broke your rules.
          </div>

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <Field label='Emotion Tag'>
              <select
                className={controlClass}
                value={s.emotionTag}
                onChange={(e) => s.setEmotionTag(e.target.value)}>
                <option value=''>—</option>
                <option value='Calm'>Calm</option>
                <option value='Confident'>Confident</option>
                <option value='Anxious'>Anxious</option>
                <option value='FOMO'>FOMO</option>
                <option value='Revenge'>Revenge</option>
                <option value='Overconfident'>Overconfident</option>
              </select>
            </Field>

            <Field label='Lesson Learned'>
              <textarea
                className={`${controlClass} min-h-24`}
                style={lessonTooShort ? { borderColor: 'var(--accent)' } : undefined}
                value={s.lessonLearned}
                onChange={(e) => s.setLessonLearned(e.target.value)}
                placeholder='Write at least one full sentence.'
              />
              <div className='text-xs text-[var(--text-muted)]'>
                Minimum: one sentence (4+ words).
              </div>
              {lessonTooShort && (
                <div className='text-xs text-[var(--text-secondary)]'>
                  Add a little more detail so it reads like a full sentence.
                </div>
              )}
            </Field>
          </div>

          <Field label='Extra Notes (optional)'>
            <textarea
              className={`${controlClass} min-h-28`}
              value={s.reviewNotes}
              onChange={(e) => s.setReviewNotes(e.target.value)}
              placeholder='Any context you want to remember.'
            />
          </Field>
        </section>

        <section className='space-y-1 text-sm text-[var(--text-secondary)]'>
          {s.trade.reviewed_at && (
            <div>
              Previously reviewed on{' '}
              {new Date(s.trade.reviewed_at).toLocaleString()}
            </div>
          )}

          {s.trade.reviewed_at && (
            <div>
              Last updated on {new Date(s.trade.reviewed_at).toLocaleString()}
            </div>
          )}
        </section>
      </div>

      <div className='fixed right-4 top-4 z-40'>
        <div
          className='rounded-full border bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium shadow-sm'
          style={{
            borderColor: `color-mix(in srgb, ${scoreTone} 32%, var(--border-default))`,
            color: `color-mix(in srgb, ${scoreTone} 88%, var(--text-primary))`,
          }}>
          Execution Score: {checklistScore}%
        </div>
      </div>

      <div className='fixed bottom-4 right-4 z-40'>
        <button
          className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] shadow-lg transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
          disabled={s.saving}
          onClick={s.saveAndMarkReviewed}>
          Mark Reviewed
        </button>
      </div>
    </main>
  );
}

function PnlMiniCard({ label, value }: { label: string; value: number }) {
  const tone =
    value > 0
      ? 'var(--profit)'
      : value < 0
        ? 'var(--loss)'
        : 'var(--text-secondary)';

  return (
    <div
      className='rounded-lg border px-4 py-3'
      style={{
        borderColor: `color-mix(in srgb, ${tone} 32%, var(--border-default))`,
        backgroundColor: `color-mix(in srgb, ${tone} 10%, var(--bg-surface))`,
      }}>
      <div className='text-xs text-[var(--text-muted)]'>{label}</div>
      <div
        className='text-xl font-semibold'
        style={{
          color: `color-mix(in srgb, ${tone} 88%, var(--text-primary))`,
        }}>
        {money(value)}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className='space-y-1 block'>
      <div className='text-sm text-[var(--text-secondary)]'>{label}</div>
      {children}
    </label>
  );
}
