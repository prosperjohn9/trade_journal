'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTradeReview } from '@/src/hooks/useTradeReview';

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

export function TradeReviewClient() {
  const router = useRouter();
  const s = useTradeReview();

  if (s.loading && !s.trade) {
    return <main className='p-6'>{s.msg || 'Loading...'}</main>;
  }

  if (!s.trade) {
    return (
      <main className='p-6 space-y-3'>
        <div className='opacity-80'>{s.msg || 'Trade not found.'}</div>
        <button
          className='border rounded-lg px-4 py-2'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </main>
    );
  }

  return (
    <main className='p-6 space-y-6 max-w-4xl'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Review Trade</h1>
          <div className='text-sm opacity-80'>
            {s.trade.instrument} • {s.trade.direction} • {s.trade.outcome} •{' '}
            {new Date(s.trade.opened_at).toLocaleString()}
          </div>
          {!!s.msg && <div className='text-sm opacity-80'>{s.msg}</div>}
        </div>

        <div className='flex gap-2'>
          <button className='border rounded-lg px-4 py-2' onClick={s.goBack}>
            Back
          </button>
        </div>
      </header>

      {/* Setup checklist */}
      <section className='border rounded-xl p-4 space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Setup Checklist</h2>
          <div className='text-sm opacity-80'>
            Adherence:{' '}
            <span className='font-semibold'>{s.adherence.checked}</span>/
            {s.adherence.total} ({s.adherence.pct.toFixed(0)}%)
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <label className='space-y-1'>
            <div className='text-sm opacity-70'>Template</div>
            <select
              className='border rounded-lg p-3 w-full'
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
              className='border rounded-lg px-4 py-2'
              onClick={() => router.push('/settings/setups')}>
              Manage Setups
            </button>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
          {s.activeItems.map((it) => (
            <label
              key={it.id}
              className='flex items-center gap-3 border rounded-lg p-3'>
              <input
                type='checkbox'
                checked={!!s.checks[it.id]}
                onChange={() => s.toggleCheck(it.id)}
              />
              <span>{it.label}</span>
            </label>
          ))}

          {!!s.templateId && s.activeItems.length === 0 && (
            <div className='text-sm opacity-70'>
              No active items in this template yet.
            </div>
          )}
        </div>

        {s.activeItems.length > 0 && (
          <div className='text-sm opacity-80'>
            Missed criteria:{' '}
            <span className='font-semibold'>{s.missedCount}</span>
          </div>
        )}
      </section>

      {/* Execution */}
      <section className='border rounded-xl p-4 space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Execution</h2>
          <div className='text-sm opacity-80'>
            Gross P/L:{' '}
            <span className='font-semibold'>{money(s.grossPnl)}</span> • Net
            P/L: <span className='font-semibold'>{money(s.netPnl)}</span>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Entry Price'>
            <input
              className='border rounded-lg p-3 w-full'
              value={s.entryPrice}
              onChange={(e) => s.setEntryPrice(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.10250'
            />
          </Field>

          <Field label='Stop Loss'>
            <input
              className='border rounded-lg p-3 w-full'
              value={s.stopLoss}
              onChange={(e) => s.setStopLoss(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.10000'
            />
          </Field>

          <Field label='Take Profit'>
            <input
              className='border rounded-lg p-3 w-full'
              value={s.takeProfit}
              onChange={(e) => s.setTakeProfit(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.11000'
            />
          </Field>

          <Field label='Exit Price'>
            <input
              className='border rounded-lg p-3 w-full'
              value={s.exitPrice}
              onChange={(e) => s.setExitPrice(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.10800'
            />
          </Field>

          <Field label='Exit Date/Time'>
            <input
              className='border rounded-lg p-3 w-full'
              type='datetime-local'
              value={s.closedAt}
              onChange={(e) => s.setClosedAt(e.target.value)}
            />
          </Field>

          <Field label='Commission'>
            <input
              className='border rounded-lg p-3 w-full'
              value={s.commission}
              onChange={(e) => s.setCommission(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 6'
            />
          </Field>
        </div>
      </section>

      {/* After-trade screenshot */}
      <section className='border rounded-xl p-4 space-y-3'>
        <h2 className='font-semibold'>After-Trade Screenshot</h2>

        {s.afterSignedUrl ? (
          <div className='space-y-2'>
            <div className='flex items-center gap-2 flex-wrap'>
              <button
                className='border rounded-lg px-4 py-2'
                onClick={s.openAfterScreenshot}>
                View current
              </button>
              <div className='text-sm opacity-70'>
                Upload a new one to replace it.
              </div>
            </div>

            <Image
              src={s.afterSignedUrl}
              alt='Current after-trade screenshot'
              width={1200}
              height={700}
              unoptimized
              className='max-h-64 w-auto rounded-lg border cursor-pointer'
              onClick={s.openAfterScreenshot}
              title='Click to view full screen'
            />
          </div>
        ) : s.trade.after_trade_screenshot_url ? (
          <div className='text-sm opacity-70'>
            Screenshot exists, but preview could not be loaded.
          </div>
        ) : (
          <div className='text-sm opacity-70'>No screenshot uploaded yet.</div>
        )}

        <input type='file' accept='image/*' onChange={s.onAfterFileChange} />

        {s.afterPreviewUrl && (
          <div className='space-y-2'>
            <div className='text-sm opacity-70'>
              New screenshot preview (will replace on save)
            </div>
            <Image
              src={s.afterPreviewUrl}
              alt='After screenshot preview'
              width={1200}
              height={700}
              unoptimized
              className='max-h-64 w-auto rounded-lg border'
            />
          </div>
        )}
      </section>

      {/* Reflection */}
      <section className='border rounded-xl p-4 space-y-4'>
        <h2 className='font-semibold'>Reflection</h2>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Emotion Tag'>
            <select
              className='border rounded-lg p-3 w-full'
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
            <input
              className='border rounded-lg p-3 w-full'
              value={s.lessonLearned}
              onChange={(e) => s.setLessonLearned(e.target.value)}
              placeholder='1 sentence is enough.'
            />
          </Field>
        </div>

        <Field label='Extra Notes (optional)'>
          <textarea
            className='border rounded-lg p-3 w-full min-h-28'
            value={s.reviewNotes}
            onChange={(e) => s.setReviewNotes(e.target.value)}
            placeholder='Any context you want to remember.'
          />
        </Field>
      </section>

      <section className='flex flex-wrap gap-2 items-center'>
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          disabled={s.saving}
          onClick={s.saveAndMarkReviewed}>
          Mark Reviewed
        </button>

        {s.trade.reviewed_at && (
          <div className='text-sm opacity-80'>
            Previously reviewed on{' '}
            {new Date(s.trade.reviewed_at).toLocaleString()}
          </div>
        )}
      </section>
    </main>
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
      <div className='text-sm opacity-70'>{label}</div>
      {children}
    </label>
  );
}