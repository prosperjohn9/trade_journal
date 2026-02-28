'use client';

import { formatAccountTagLabel } from '@/src/domain/account';
import { formatMoney } from '@/src/lib/utils/format';
import { cx } from '@/src/lib/utils/ui';
import type { useAccounts } from '@/src/hooks/useAccounts';

const MAX_VISIBLE_TAGS = 3;
const TYPE_ACCENTS: Record<string, string> = {
  live: 'var(--profit)',
  demo: '#3b82f6',
  challenge: 'var(--accent)',
  funded: '#f59e0b',
  investor: 'var(--text-muted)',
};

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  | 'accounts'
  | 'openEdit'
  | 'onSetDefault'
  | 'settingDefaultId'
  | 'requestDelete'
>;

export function AccountsTable({ state: s }: { state: AccountsState }) {
  const defaultAccount = s.accounts.find((a) => a.is_default) ?? null;
  const totalAccounts = s.accounts.length;
  const totalStartingBalance = s.accounts.reduce(
    (sum, account) => sum + Number(account.starting_balance ?? 0),
    0,
  );
  const uniqueCurrencies = Array.from(
    new Set(s.accounts.map((a) => a.base_currency ?? 'USD')),
  );
  const totalCurrency = uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : 'USD';
  const hasMixedCurrencies = uniqueCurrencies.length > 1;

  return (
    <section className='space-y-6'>
      <div className='grid grid-cols-1 gap-3.5 md:grid-cols-3'>
        <SummaryCard
          label='Total Accounts'
          value={String(totalAccounts)}
          compactValue
        />
        <SummaryCard
          label='Total Starting Capital'
          value={formatMoney(totalStartingBalance, totalCurrency)}
          note={hasMixedCurrencies ? 'Mixed currencies' : undefined}
        />
        <SummaryCard
          label='Default Account'
          value={defaultAccount?.name ?? '—'}
          compactValue
        />
      </div>

      <div className='space-y-4'>
        {s.accounts.map((a) => {
          const currency = a.base_currency ?? 'USD';
          const tradeCount = Number(a.trade_count ?? 0);
          const netPnl = Number(a.net_pnl ?? 0);
          const canDelete = !a.is_default;
          const visibleTags = a.tags.slice(0, MAX_VISIBLE_TAGS);
          const hiddenTagCount = Math.max(a.tags.length - visibleTags.length, 0);

          return (
            <article
              key={a.id}
              className='relative overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5'
              style={
                a.is_default
                  ? {
                      borderColor:
                        'color-mix(in srgb, var(--accent) 34%, var(--border-default))',
                      boxShadow:
                        '0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent), 0 24px 34px -34px color-mix(in srgb, var(--accent) 60%, transparent)',
                    }
                  : undefined
              }>
              {a.is_default && (
                <span
                  className='pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full'
                  style={{
                    background:
                      'linear-gradient(to bottom, color-mix(in srgb, var(--accent) 80%, transparent), color-mix(in srgb, var(--accent) 36%, transparent))',
                  }}
                />
              )}

              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <h3 className='text-xl font-semibold tracking-tight text-[var(--text-primary)]'>
                    {a.name}
                  </h3>
                  <div className='mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-muted)]'>
                    <AccountTypeBadge accountType={a.account_type} />
                    <span aria-hidden='true'>·</span>
                    <span>{currency}</span>
                  </div>

                  {visibleTags.length > 0 && (
                    <div className='mt-3 flex flex-wrap items-center gap-1.5'>
                      {visibleTags.map((tag) => (
                        <span
                          key={`${a.id}-${tag}`}
                          className='inline-flex items-center rounded-full bg-[var(--neutral-badge)] px-2 py-1 text-[13px] leading-none text-[var(--neutral-text)]'>
                          {formatAccountTagLabel(tag)}
                        </span>
                      ))}
                      {hiddenTagCount > 0 && (
                        <span className='text-xs text-[var(--text-muted)]'>
                          +{hiddenTagCount} more
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {a.is_default && (
                  <span
                    className='inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide'
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--accent) 14%, var(--bg-surface))',
                      borderColor:
                        'color-mix(in srgb, var(--accent) 35%, transparent)',
                      color: 'color-mix(in srgb, var(--accent) 86%, var(--text-primary))',
                    }}>
                    Default
                  </span>
                )}
              </div>

              <p className='mt-4 text-[15px] font-medium text-[var(--text-secondary)]'>
                Starting Balance:{' '}
                <span className='font-semibold text-[var(--text-primary)]'>
                  {formatMoney(Number(a.starting_balance ?? 0), currency)}
                </span>
              </p>

              <div className='mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-secondary)]'>
                <span>
                  Trades:{' '}
                  <strong className='font-semibold text-[var(--text-primary)]'>
                    {tradeCount}
                  </strong>
                </span>
                <span>
                  Net P&L:{' '}
                  <strong
                    className={cx(
                      'font-semibold',
                      netPnl > 0
                        ? 'text-[var(--profit)]'
                        : netPnl < 0
                          ? 'text-[var(--loss)]'
                          : 'text-[var(--text-primary)]',
                    )}>
                    {netPnl > 0 ? '+' : ''}
                    {formatMoney(netPnl, currency)}
                  </strong>
                </span>
              </div>

              <div
                className='mt-4 border-t pt-4'
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--border-default) 58%, transparent)',
                }}>
                <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
                  <button
                    className='text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'
                    onClick={() => s.openEdit(a)}>
                    Edit
                  </button>

                  {!a.is_default && (
                    <>
                      <span className='text-[var(--text-muted)]'>•</span>
                      <button
                        className='text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'
                        onClick={() => s.onSetDefault(a.id)}
                        disabled={s.settingDefaultId === a.id}>
                        {s.settingDefaultId === a.id ? 'Setting…' : 'Set Default'}
                      </button>
                    </>
                  )}

                  <span className='text-[var(--text-muted)]'>•</span>
                  <button
                    className='text-[var(--loss)] transition-colors hover:opacity-85 disabled:cursor-not-allowed disabled:text-[var(--text-muted)]'
                    onClick={() => s.requestDelete(a)}
                    disabled={!canDelete}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {!s.accounts.length && (
          <div className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-6 text-sm text-[var(--text-secondary)]'>
            No accounts yet. Click <span className='font-semibold'>Add Account</span>{' '}
            to create your first one.
          </div>
        )}
      </div>
    </section>
  );
}

function AccountTypeBadge({ accountType }: { accountType: string }) {
  const accent =
    TYPE_ACCENTS[accountType.trim().toLowerCase()] ?? TYPE_ACCENTS.investor;

  return (
    <span
      className='inline-flex items-center rounded-[9px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.03em]'
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 14%, var(--bg-surface))`,
        borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
        color: `color-mix(in srgb, ${accent} 88%, var(--text-primary))`,
      }}>
      {accountType}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  note,
  compactValue = false,
}: {
  label: string;
  value: string;
  note?: string;
  compactValue?: boolean;
}) {
  return (
    <div
      className='rounded-xl border bg-[var(--surface-elevated)] px-5 py-5'
      style={{
        borderColor: 'color-mix(in srgb, var(--border-default) 74%, transparent)',
      }}>
      <div
        className='text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]'
        style={{ opacity: 0.8 }}>
        {label}
      </div>
      <div
        className={cx(
          'mt-3 leading-tight text-[var(--text-primary)]',
          compactValue ? 'text-2xl font-semibold' : 'text-[1.85rem] font-semibold',
        )}>
        {value}
      </div>
      {note && (
        <div
          className='mt-1.5 text-xs text-[var(--text-muted)]'
          style={{ opacity: 0.72 }}>
          {note}
        </div>
      )}
    </div>
  );
}