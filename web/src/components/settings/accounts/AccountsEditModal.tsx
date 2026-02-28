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
  | 'editing'
  | 'closeEdit'
  | 'editMsg'
  | 'editName'
  | 'setEditName'
  | 'editAccountType'
  | 'setEditAccountType'
  | 'editTags'
  | 'editTagInput'
  | 'setEditTagInput'
  | 'addTagToEditDraft'
  | 'removeEditTag'
  | 'allTagSuggestions'
  | 'editStartingBalance'
  | 'setEditStartingBalance'
  | 'editCurrency'
  | 'setEditCurrency'
  | 'saving'
  | 'onSaveEdit'
>;

export function AccountsEditModal({ state: s }: { state: AccountsState }) {
  const symbol = currencySymbolForCode(s.editCurrency);

  return (
    <Modal
      open={!!s.editing}
      title='Edit account'
      subtitle='Update your account details and starting capital.'
      onClose={s.closeEdit}>
      {s.editing && (
        <div className='space-y-6'>
          {s.editMsg && (
            <div className='text-sm text-rose-700'>{s.editMsg}</div>
          )}

          <label className='block space-y-1.5'>
            <div className='text-sm text-[var(--text-secondary)]'>Name</div>
            <input
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              value={s.editName}
              onChange={(e) => s.setEditName(e.target.value)}
            />
          </label>

          <label className='block space-y-1.5'>
            <div className='text-sm text-[var(--text-secondary)]'>Account Type</div>
            <select
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              value={s.editAccountType}
              onChange={(e) =>
                s.setEditAccountType(normalizeAccountType(e.target.value))
              }>
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
              value={s.editTags}
              inputValue={s.editTagInput}
              suggestions={s.allTagSuggestions}
              placeholder='Add tags (e.g., FTMO, Phase 1, Swing)'
              onInputChange={s.setEditTagInput}
              onAddTag={s.addTagToEditDraft}
              onRemoveTag={s.removeEditTag}
              disabled={s.saving}
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
                value={s.editStartingBalance}
                onChange={(e) => s.setEditStartingBalance(e.target.value)}
              />
            </div>
          </label>

          <label className='block space-y-1.5'>
            <div className='text-sm text-[var(--text-secondary)]'>Currency</div>
            <input
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]'
              value={s.editCurrency}
              onChange={(e) => s.setEditCurrency(e.target.value)}
              placeholder='e.g., USD'
            />
          </label>

          <div className='flex justify-end gap-2 pt-1'>
            <button
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'
              onClick={s.closeEdit}
              disabled={s.saving}>
              Cancel
            </button>

            <button
              className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
              onClick={s.onSaveEdit}
              disabled={s.saving}>
              {s.saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
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
