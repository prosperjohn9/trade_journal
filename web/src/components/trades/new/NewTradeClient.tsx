'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useNewTrade } from '@/src/hooks/useNewTrade';

export function NewTradeClient() {
  const router = useRouter();
  const s = useNewTrade();

  return (
    <main className='p-6 max-w-2xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Add Trade</h1>
        <button
          className='border rounded-lg px-4 py-2'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </header>

      {!s.hasAccounts && (
        <div className='border rounded-xl p-4 text-sm'>
          <div className='font-semibold'>No accounts found</div>
          <div className='opacity-80 mt-1'>
            You need at least one account before adding trades.
          </div>
          <button
            className='border rounded-lg px-4 py-2 mt-3'
            onClick={() => router.push('/settings/accounts')}>
            Go to Accounts
          </button>
        </div>
      )}

      <form
        onSubmit={s.onSaveTrade}
        className='space-y-4 border rounded-xl p-4'>
        {/* Account */}
        <Field label='Account'>
          <select
            className='w-full border rounded-lg p-3'
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
          <div className='text-xs opacity-60 mt-1'>
            Trades must belong to an account.
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

        {/* Setup + checklist */}
        <Field label='Setup (Entry Criteria)'>
          <div className='space-y-3'>
            <select
              className='w-full border rounded-lg p-3'
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

            {s.templateId && s.items.length > 0 ? (
              <div className='border rounded-lg p-3 space-y-2'>
                <div className='flex items-center justify-between'>
                  <div className='text-sm opacity-70'>
                    Tick what you followed at entry (unchecked = missed
                    criteria)
                  </div>
                  <div className='text-sm font-semibold'>
                    {s.checklistScore === null ? '—' : `${s.checklistScore}%`}
                  </div>
                </div>

                <div className='grid grid-cols-1 gap-2'>
                  {s.items.map((it) => (
                    <label
                      key={it.id}
                      className='flex items-center gap-3 border rounded-lg px-3 py-2'>
                      <input
                        type='checkbox'
                        checked={!!s.checks[it.id]}
                        onChange={() => s.toggle(it.id)}
                      />
                      <span className='text-sm'>{it.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : s.templateId ? (
              <div className='text-sm opacity-70'>
                This setup has no active checklist items.
              </div>
            ) : (
              <div className='text-sm opacity-70'>
                Create a setup in <span className='font-semibold'>Setups</span>{' '}
                first.
              </div>
            )}

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

        {/* Before screenshot */}
        <section className='border rounded-xl p-4 space-y-2'>
          <div className='font-semibold'>Before-Trade Screenshot</div>
          <div className='text-sm opacity-70'>
            Upload your setup screenshot.
          </div>

          <input
            className='block'
            type='file'
            accept='image/*'
            onChange={(e) => s.onBeforeFileChange(e.target.files?.[0] ?? null)}
          />

          <div className='text-xs opacity-70'>
            {s.beforeFile
              ? `Selected: ${s.beforeFile.name}`
              : 'No screenshot selected.'}
          </div>

          {s.beforePreviewUrl && (
            <Image
              src={s.beforePreviewUrl}
              alt='Before screenshot preview'
              width={1200}
              height={700}
              unoptimized
              className='max-h-64 w-auto rounded-lg border'
            />
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
              onChange={(e) =>
                s.setDirection(e.target.value === 'SELL' ? 'SELL' : 'BUY')
              }>
              <option value='BUY'>BUY</option>
              <option value='SELL'>SELL</option>
            </select>
          </Field>

          <Field label='Outcome'>
            <select
              className='w-full border rounded-lg p-3'
              value={s.outcome}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                s.setOutcome(e.target.value as 'WIN' | 'LOSS' | 'BREAKEVEN')
              }>
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
          <Field label='Risk ($) — Necessary for R multiple'>
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
          disabled={s.saving || !s.hasAccounts}>
          Save Trade
        </button>

        {s.msg && <p className='text-sm opacity-80'>{s.msg}</p>}
      </form>
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
    <label className='block space-y-1'>
      <div className='text-sm opacity-70'>{label}</div>
      {children}
    </label>
  );
}