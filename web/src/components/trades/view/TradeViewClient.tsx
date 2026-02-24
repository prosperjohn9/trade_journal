'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTradeView } from '@/src/hooks/useTradeView';
import { formatMoney } from '@/src/lib/utils/format';

export function TradeViewClient() {
  const router = useRouter();
  const s = useTradeView();

  if (!s.trade) {
    return (
      <main className='p-6'>
        <p className='opacity-80'>{s.msg || 'Loading…'}</p>

        <button
          className='border rounded-lg px-4 py-2 mt-4'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </main>
    );
  }

  const t = s.trade;

  return (
    <main className='p-6 max-w-4xl space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Trade Details</h1>

          <div className='text-sm opacity-80'>
            {t.instrument} • {t.direction} • {t.outcome} •{' '}
            {new Date(t.opened_at).toLocaleString()}
            {t.account?.name ? ` • ${t.account.name}` : ''}
          </div>

          {s.isReviewed && t.reviewed_at && (
            <div className='text-sm opacity-80'>
              Reviewed on {new Date(t.reviewed_at).toLocaleString()}
            </div>
          )}
        </div>

        <div className='flex gap-2 flex-wrap'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push(`/trades/${t.id}/edit`)}>
            Edit Trade
          </button>

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </header>

      {/* ENTRY */}
      <section className='border rounded-xl p-4 space-y-3'>
        <h2 className='font-semibold'>Entry</h2>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Row label='Account' value={t.account?.name ?? '—'} />
          <Row label='P&L ($)' value={Number(t.pnl_amount).toFixed(2)} />
          <Row label='P&L (%)' value={`${Number(t.pnl_percent).toFixed(2)}%`} />
          <Row
            label='Risk ($)'
            value={
              t.risk_amount === null ? '—' : Number(t.risk_amount).toFixed(2)
            }
          />
          <Row
            label='R Multiple'
            value={
              t.r_multiple === null ? '—' : Number(t.r_multiple).toFixed(2)
            }
          />
        </div>

        {t.notes && <Row label='Notes' value={t.notes} />}

        {/* Checklist */}
        <div className='pt-3 border-t space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>Setup Checklist</div>

            {s.activeItems.length ? (
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

          {s.activeItems.length > 0 && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
              {s.activeItems.map((it) => {
                const ok = !!s.checks[it.id];

                return (
                  <div
                    key={it.id}
                    className={`flex items-center gap-3 border rounded-lg p-3 ${
                      ok ? '' : 'border-red-300'
                    }`}>
                    <div className='h-5 w-5 rounded-full border flex items-center justify-center text-xs'>
                      {ok ? '✓' : '✕'}
                    </div>

                    <div className='text-sm'>
                      <span className={ok ? '' : 'font-semibold'}>
                        {it.label}
                      </span>
                      {!ok && (
                        <span className='ml-2 text-xs opacity-70'>
                          (missed)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BEFORE screenshot */}
        <div className='pt-3 border-t space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>Before-Trade Screenshot</div>

            {s.beforeUrl ? (
              <button
                className='border rounded-lg px-3 py-2'
                onClick={() => s.openFull(s.beforeUrl)}>
                View
              </button>
            ) : (
              <div className='text-sm opacity-70'>None</div>
            )}
          </div>

          {s.beforeUrl && (
            <Image
              src={s.beforeUrl}
              alt='Before trade screenshot'
              width={1200}
              height={700}
              unoptimized
              className='max-h-72 w-auto rounded-lg border cursor-pointer'
              onClick={() => s.openFull(s.beforeUrl)}
              title='Click to view full screen'
            />
          )}
        </div>
      </section>

      {/* REVIEW */}
      {!s.isReviewed ? (
        <section className='border rounded-xl p-4 space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='font-semibold'>Review</h2>
            <button
              className='border rounded-lg px-4 py-2'
              onClick={() => router.push(`/trades/${t.id}/review`)}>
              Review Trade
            </button>
          </div>

          <div className='text-sm opacity-70'>
            This trade hasn’t been reviewed yet.
          </div>
        </section>
      ) : (
        <section className='border rounded-xl p-4 space-y-4'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='font-semibold'>Review</h2>
            <div className='text-sm opacity-80'>
              Gross P/L:{' '}
              <span className='font-semibold'>
                {formatMoney(s.grossPnl, 'USD')}
              </span>{' '}
              • Net P/L:{' '}
              <span className='font-semibold'>
                {formatMoney(s.netPnl, 'USD')}
              </span>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
            <Row label='Entry Price' value={fmtNum(t.entry_price)} />
            <Row label='Stop Loss' value={fmtNum(t.stop_loss)} />
            <Row label='Take Profit' value={fmtNum(t.take_profit)} />
            <Row label='Exit Price' value={fmtNum(t.exit_price)} />
            <Row
              label='Exit Date/Time'
              value={t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}
            />
            <Row label='Commission' value={fmtMoney(t.commission)} />
          </div>

          {/* AFTER screenshot */}
          <div className='pt-3 border-t space-y-2'>
            <div className='flex items-center justify-between gap-3'>
              <div className='font-semibold'>After-Trade Screenshot</div>

              {s.afterUrl ? (
                <button
                  className='border rounded-lg px-3 py-2'
                  onClick={() => s.openFull(s.afterUrl)}>
                  View
                </button>
              ) : (
                <div className='text-sm opacity-70'>None</div>
              )}
            </div>

            {s.afterUrl && (
              <Image
                src={s.afterUrl}
                alt='After trade screenshot'
                width={1200}
                height={700}
                unoptimized
                className='max-h-72 w-auto rounded-lg border cursor-pointer'
                onClick={() => s.openFull(s.afterUrl)}
                title='Click to view full screen'
              />
            )}
          </div>

          {/* Reflection */}
          <div className='pt-3 border-t'>
            <h3 className='font-semibold'>Reflection</h3>

            <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mt-2'>
              <Row label='Emotion Tag' value={t.emotion_tag ?? '—'} />
              <Row label='Lesson Learned' value={t.lesson_learned ?? '—'} />
            </div>

            {t.review_notes && (
              <Row label='Extra Notes' value={t.review_notes} />
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function fmtNum(n: number | null, digits = 5) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits);
}

function fmtMoney(n: number | null) {
  if (n === null || n === undefined) return '—';
  return formatMoney(Number(n), 'USD');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='grid grid-cols-3 gap-3'>
      <div className='text-sm opacity-70'>{label}</div>
      <div className='col-span-2 font-medium break-words'>{value}</div>
    </div>
  );
}