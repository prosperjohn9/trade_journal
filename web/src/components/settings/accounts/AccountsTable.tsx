'use client';

import { formatMoney } from '@/src/lib/utils/format';
import { cx } from '@/src/lib/utils/ui';
import type { useAccounts } from '@/src/hooks/useAccounts';

type AccountsState = Pick<
  ReturnType<typeof useAccounts>,
  | 'accounts'
  | 'openEdit'
  | 'onSetDefault'
  | 'settingDefaultId'
  | 'requestDelete'
>;

export function AccountsTable({ state: s }: { state: AccountsState }) {
  return (
    <section className='border rounded-xl p-4'>
      <div className='overflow-auto'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='text-left border-b'>
              <th className='p-2'>Name</th>
              <th className='p-2'>Starting Balance</th>
              <th className='p-2'>Currency</th>
              <th className='p-2'>Default</th>
              <th className='p-2'>Actions</th>
            </tr>
          </thead>

          <tbody>
            {s.accounts.map((a) => (
              <tr key={a.id} className='border-b'>
                <td className='p-2 font-semibold'>{a.name}</td>

                <td className='p-2'>
                  {formatMoney(
                    Number(a.starting_balance ?? 0),
                    a.base_currency ?? 'USD',
                  )}
                </td>

                <td className='p-2'>{a.base_currency ?? '—'}</td>

                <td className='p-2'>
                  <span
                    className={cx(
                      'text-xs border rounded-full px-2 py-1',
                      a.is_default ? 'bg-slate-50' : 'bg-white',
                    )}>
                    {a.is_default ? 'Default' : '—'}
                  </span>
                </td>

                <td className='p-2'>
                  <div className='flex flex-wrap gap-2'>
                    <button
                      className='border rounded-lg px-3 py-1'
                      onClick={() => s.openEdit(a)}>
                      Edit
                    </button>

                    {!a.is_default && (
                      <button
                        className='border rounded-lg px-3 py-1 disabled:opacity-60'
                        onClick={() => s.onSetDefault(a.id)}
                        disabled={s.settingDefaultId === a.id}>
                        {s.settingDefaultId === a.id
                          ? 'Setting…'
                          : 'Set Default'}
                      </button>
                    )}

                    <button
                      className='border rounded-lg px-3 py-1 disabled:opacity-50'
                      onClick={() => s.requestDelete(a)}
                      disabled={a.is_default}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {!s.accounts.length && (
              <tr>
                <td className='p-2 opacity-70' colSpan={5}>
                  No accounts yet. Click “Add Account”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className='text-xs opacity-70 mt-3'>
        Tip: Use “Set Default” to control which account auto-selects on the
        Dashboard.
      </div>
    </section>
  );
}