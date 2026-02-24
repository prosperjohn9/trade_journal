'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  useTradeEdit,
  parseDirection,
  parseOutcome,
} from '@/src/hooks/useTradeEdit';

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className='block space-y-1'>
      <div className='text-sm opacity-70'>{label}</div>
      {children}
    </label>
  );
}

export function TradeEditClient() {
  const router = useRouter();
  const s = useTradeEdit();

  if (s.loading) {
    return (
      <main className='p-6'>
        <p className='opacity-80'>Loading...</p>
      </main>
    );
  }

  return (
    <main className='p-6 max-w-2xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Edit Trade</h1>
        <button className='border rounded-lg px-4 py-2' onClick={s.goBackSafe}>
          Cancel
        </button>
      </header>

      {!!s.msg && <p className='text-sm opacity-80'>{s.msg}</p>}

      {/* ===== ENTRY FORM ===== */}
      <form onSubmit={s.saveEntry} className='space-y-4 border rounded-xl p-4'>
        <h2 className='font-semibold'>Entry</h2>

        <Field label='Account'>
          <select
            className='w-full border rounded-lg p-3'
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

          <div className='text-xs opacity-60 mt-1'>
            Manage accounts in{' '}
            <button
              type='button'
              className='underline'
              onClick={() => router.push('/settings/accounts')}>
              Settings → Accounts
            </button>
          </div>
        </Field>

        <Field label='Date/Time'>
          <input
            className='w-full border rounded-lg p-3'
            type='datetime-local'
            value={s.openedAt}
            onChange={(e) => s.setOpenedAt(e.target.value)}
            required
          />
        </Field>

        <Field label='Setup (Entry Criteria)'>
          <div className='space-y-3'>
            <select
              className='w-full border rounded-lg p-3'
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

            <div className='text-xs opacity-60'>
              Manage setups in{' '}
              <button
                type='button'
                className='underline'
                onClick={() => router.push('/settings/setups')}>
                Settings → Setups
              </button>
            </div>
          </div>
        </Field>

        {/* Setup checklist */}
        <section className='border rounded-xl p-4 space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>Setup Checklist</div>

            {!s.templateId ? (
              <div className='text-sm opacity-70'>No setup selected.</div>
            ) : s.activeItems.length ? (
              <div className='text-sm opacity-80'>
                Adherence:{' '}
                <span className='font-semibold'>{s.adherence.checked}</span>/
                {s.adherence.total} ({s.adherence.pct.toFixed(0)}%) • Missed:{' '}
                <span className='font-semibold'>{s.adherence.missed}</span>
              </div>
            ) : (
              <div className='text-sm opacity-70'>No checklist items.</div>
            )}
          </div>

          {!!s.templateId && s.activeItems.length > 0 && (
            <div className='grid grid-cols-1 gap-2'>
              {s.activeItems.map((it) => {
                const ok = !!s.checks[it.id];
                return (
                  <label
                    key={it.id}
                    className={`flex items-center gap-3 border rounded-lg p-3 ${
                      ok ? '' : 'border-red-300'
                    }`}>
                    <input
                      type='checkbox'
                      checked={ok}
                      onChange={() => s.toggleCheck(it.id)}
                    />
                    <span className='text-sm'>{it.label}</span>
                    {!ok && (
                      <span className='text-xs opacity-70'>(missed)</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

        </section>

        {/* Before screenshot */}
        <section className='border rounded-xl p-4 space-y-2'>
          <div className='font-semibold'>Before-Trade Screenshot</div>
          <div className='text-sm opacity-70'>
            Current screenshot is shown below. Choose a file to replace it
            (optional).
          </div>

          {s.beforeSignedUrl ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-3'>
                <div className='text-sm opacity-80'>Current screenshot</div>
                <button
                  type='button'
                  className='border rounded-lg px-3 py-2'
                  onClick={() => s.openFull(s.beforeSignedUrl)}>
                  View Full
                </button>
              </div>
              <Image
                src={s.beforeSignedUrl}
                alt='Current before screenshot'
                width={1200}
                height={700}
                unoptimized
                className='max-h-64 w-auto rounded-lg border cursor-pointer'
                onClick={() => s.openFull(s.beforeSignedUrl)}
                title='Click to view full screen'
              />
            </div>
          ) : (
            <div className='text-sm opacity-70'>No current screenshot.</div>
          )}

          <input
            type='file'
            accept='image/*'
            onChange={(e) =>
              s.setBeforeFileWithPreview(e.target.files?.[0] ?? null)
            }
          />

          {s.beforePreviewUrl && (
            <div className='space-y-2'>
              <div className='text-sm opacity-80'>
                New screenshot preview (will replace on save)
              </div>
              <Image
                src={s.beforePreviewUrl}
                alt='New before preview'
                width={1200}
                height={700}
                unoptimized
                className='max-h-64 w-auto rounded-lg border'
              />
            </div>
          )}
        </section>

        <Field label='Instrument'>
          <input
            className='w-full border rounded-lg p-3'
            value={s.instrument}
            onChange={(e) => s.setInstrument(e.target.value.toUpperCase())}
            required
          />
        </Field>

        <div className='grid grid-cols-2 gap-3'>
          <Field label='Direction'>
            <select
              className='w-full border rounded-lg p-3'
              value={s.direction}
              onChange={(e) => s.setDirection(parseDirection(e.target.value))}>
              <option value='BUY'>BUY</option>
              <option value='SELL'>SELL</option>
            </select>
          </Field>

          <Field label='Outcome'>
            <select
              className='w-full border rounded-lg p-3'
              value={s.outcome}
              onChange={(e) => s.setOutcome(parseOutcome(e.target.value))}>
              <option value='WIN'>WIN</option>
              <option value='LOSS'>LOSS</option>
              <option value='BREAKEVEN'>BREAKEVEN</option>
            </select>
          </Field>
        </div>

        <div className='grid grid-cols-2 gap-3'>
          <Field label='P&L ($)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.pnlAmount}
              onChange={(e) => s.setPnlAmount(e.target.value)}
              required
            />
          </Field>

          <Field label='P&L (%)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.pnlPercent}
              onChange={(e) => s.setPnlPercent(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Risk ($) — for R multiple'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.riskAmount}
              onChange={(e) => s.setRiskAmount(Number(e.target.value))}
            />
          </Field>

          <div className='border rounded-lg p-3 flex items-center'>
            <div className='text-sm opacity-70'>
              R-Multiple:{' '}
              <span className='font-semibold'>
                {s.rMultiple === null || Number.isNaN(s.rMultiple)
                  ? '—'
                  : s.rMultiple.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <Field label='Notes (optional)'>
          <textarea
            className='w-full border rounded-lg p-3 min-h-28'
            value={s.notes}
            onChange={(e) => s.setNotes(e.target.value)}
          />
        </Field>

        <button
          className='w-full border rounded-lg p-3 disabled:opacity-60'
          disabled={!s.accountId}>
          Save Entry
        </button>

        {!!s.entryMsg && (
          <div className={`text-sm border rounded-lg p-3 ${s.entryMsgClasses}`}>
            {s.entryMsg}
          </div>
        )}
      </form>

      {/* ===== REVIEW SECTION (BOTTOM, SAME PAGE) ===== */}
      <section className='border rounded-xl p-4 space-y-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='space-y-1'>
            <h2 className='font-semibold'>Review</h2>
            {s.reviewedAt ? (
              <div className='text-sm opacity-80'>
                Reviewed on {new Date(s.reviewedAt).toLocaleString()}
              </div>
            ) : (
              <div className='text-sm opacity-70'>Not reviewed yet.</div>
            )}
          </div>

          <div className='text-sm opacity-80 text-right'>
            Gross P/L:{' '}
            <span className='font-semibold'>{money(s.grossPnlNumber)}</span>
            <div>
              Net P/L:{' '}
              <span className='font-semibold'>
                {money(Number(s.netPnl || s.netPnlComputed))}
              </span>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Entry Price'>
            <input
              className='w-full border rounded-lg p-3'
              value={s.entryPrice}
              onChange={(e) => s.setEntryPrice(e.target.value)}
              placeholder='e.g. 1.07452'
            />
          </Field>

          <Field label='Stop Loss'>
            <input
              className='w-full border rounded-lg p-3'
              value={s.stopLoss}
              onChange={(e) => s.setStopLoss(e.target.value)}
              placeholder='e.g. 1.07210'
            />
          </Field>

          <Field label='Take Profit'>
            <input
              className='w-full border rounded-lg p-3'
              value={s.takeProfit}
              onChange={(e) => s.setTakeProfit(e.target.value)}
              placeholder='e.g. 1.07980'
            />
          </Field>

          <Field label='Exit Price'>
            <input
              className='w-full border rounded-lg p-3'
              value={s.exitPrice}
              onChange={(e) => s.setExitPrice(e.target.value)}
              placeholder='e.g. 1.07980'
            />
          </Field>

          <Field label='Exit Date/Time'>
            <input
              className='w-full border rounded-lg p-3'
              type='datetime-local'
              value={s.closedAtLocal}
              onChange={(e) => s.setClosedAtLocal(e.target.value)}
            />
          </Field>

          <Field label='Commission'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.commission}
              onChange={(e) => s.setCommission(e.target.value)}
            />
          </Field>

          <Field label='Net P/L (optional)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.netPnl}
              onChange={(e) => s.setNetPnl(e.target.value)}
              placeholder={`Auto: ${s.netPnlComputed.toFixed(2)}`}
            />
          </Field>
        </div>

        {/* After screenshot */}
        <section className='border rounded-xl p-4 space-y-2'>
          <div className='font-semibold'>After-Trade Screenshot</div>
          <div className='text-sm opacity-70'>
            Current screenshot is shown below. Choose a file to replace it
            (optional).
          </div>

          {s.afterSignedUrl ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-3'>
                <div className='text-sm opacity-80'>Current screenshot</div>
                <button
                  type='button'
                  className='border rounded-lg px-3 py-2'
                  onClick={() => s.openFull(s.afterSignedUrl)}>
                  View Full
                </button>
              </div>
              <Image
                src={s.afterSignedUrl}
                alt='Current after screenshot'
                width={1200}
                height={700}
                unoptimized
                className='max-h-64 w-auto rounded-lg border cursor-pointer'
                onClick={() => s.openFull(s.afterSignedUrl)}
                title='Click to view full screen'
              />
            </div>
          ) : (
            <div className='text-sm opacity-70'>No current screenshot.</div>
          )}

          <input
            type='file'
            accept='image/*'
            onChange={(e) =>
              s.setAfterFileWithPreview(e.target.files?.[0] ?? null)
            }
          />

          {s.afterPreviewUrl && (
            <div className='space-y-2'>
              <div className='text-sm opacity-80'>
                New screenshot preview (will replace on save)
              </div>
              <Image
                src={s.afterPreviewUrl}
                alt='New after preview'
                width={1200}
                height={700}
                unoptimized
                className='max-h-64 w-auto rounded-lg border'
              />
            </div>
          )}
        </section>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Emotion Tag'>
            <input
              className='w-full border rounded-lg p-3'
              value={s.emotionTag}
              onChange={(e) => s.setEmotionTag(e.target.value)}
              placeholder='e.g. Calm, FOMO, Impatient'
            />
          </Field>

          <Field label='Lesson Learned'>
            <input
              className='w-full border rounded-lg p-3'
              value={s.lessonLearned}
              onChange={(e) => s.setLessonLearned(e.target.value)}
              placeholder='e.g. Patience'
            />
          </Field>
        </div>

        <Field label='Review Notes (optional)'>
          <textarea
            className='w-full border rounded-lg p-3 min-h-28'
            value={s.reviewNotes}
            onChange={(e) => s.setReviewNotes(e.target.value)}
          />
        </Field>

        <button
          type='button'
          className='w-full border rounded-lg p-3'
          onClick={s.saveReview}>
          Save Review
        </button>
      </section>
    </main>
  );
}
