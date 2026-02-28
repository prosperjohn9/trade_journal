'use client';

import { Modal } from '@/src/components/ui/Modal';
import {
  ACCOUNT_TYPES,
  normalizeAccountType,
} from '@/src/domain/account';
import type { useAccounts } from '@/src/hooks/useAccounts';
import { normalizeCurrencyCode } from '@/src/lib/utils/format';
import { AccountsTagsInput } from './AccountsTagsInput';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  | 'showAdd'
  | 'closeAdd'
  | 'addMsg'
  | 'addName'
  | 'setAddName'
  | 'addAccountType'
  | 'setAddAccountType'
  | 'addTags'
  | 'addTagInput'
  | 'setAddTagInput'
  | 'addTagToCreateDraft'
  | 'removeCreateTag'
  | 'allTagSuggestions'
  | 'addStartingBalance'
  | 'setAddStartingBalance'
  | 'addCurrency'
  | 'setAddCurrency'
  | 'creating'
  | 'onAddAccount'
>;

export function AccountsAddModal({ state: s }: { state: AccountsState }) {
  const symbol = currencySymbolForCode(s.addCurrency);

  return (
    <Modal
      open={s.showAdd}
      title='Add account'
      subtitle='Create a new trading account.'
      onClose={s.closeAdd}>
      <div className='space-y-6'>
        {s.addMsg && <div className='text-sm text-rose-700'>{s.addMsg}</div>}

        <label className='block space-y-1.5'>
          <div className='text-sm text-[var(--text-secondary)]'>Name</div>
          <input
            className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
            value={s.addName}
            onChange={(e) => s.setAddName(e.target.value)}
            placeholder='e.g., FTMO, Personal, Prop, etc.'
          />
        </label>

        <label className='block space-y-1.5'>
          <div className='text-sm text-[var(--text-secondary)]'>Account Type</div>
          <select
            className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
            value={s.addAccountType}
            onChange={(e) => s.setAddAccountType(normalizeAccountType(e.target.value))}>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className='block space-y-1.5'>
          <div className='text-sm text-[var(--text-secondary)]'>Tags</div>
          <AccountsTagsInput
            value={s.addTags}
            inputValue={s.addTagInput}
            suggestions={s.allTagSuggestions}
            placeholder='Add tags (e.g., FTMO, Phase 1, Swing)'
            onInputChange={s.setAddTagInput}
            onAddTag={s.addTagToCreateDraft}
            onRemoveTag={s.removeCreateTag}
            disabled={s.creating}
          />
        </label>

        <label className='block space-y-1.5'>
          <div className='text-sm text-[var(--text-secondary)]'>Starting Balance</div>
          <div className='relative'>
            <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--text-secondary)]'>
              {symbol}
            </span>
            <input
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] py-3 pl-7 pr-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              type='text'
              inputMode='decimal'
              value={s.addStartingBalance}
              onChange={(e) => s.setAddStartingBalance(e.target.value)}
              placeholder='100,000'
            />
          </div>
        </label>

        <label className='block space-y-1.5'>
          <div className='text-sm text-[var(--text-secondary)]'>Currency</div>
          <input
            className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
            value={s.addCurrency}
            onChange={(e) => s.setAddCurrency(e.target.value)}
            placeholder='e.g., USD'
          />
        </label>

        <div className='flex justify-end gap-2 pt-1'>
          <button
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
            onClick={s.closeAdd}
            disabled={s.creating}>
            Cancel
          </button>

          <button
            className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
            onClick={s.onAddAccount}
            disabled={s.creating}>
            {s.creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function currencySymbolForCode(code: string): string {
  const normalized = normalizeCurrencyCode(code) ?? 'USD';

  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalized,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);

    return parts.find((part) => part.type === 'currency')?.value ?? '$';
  } catch {
    return '$';
  }
}