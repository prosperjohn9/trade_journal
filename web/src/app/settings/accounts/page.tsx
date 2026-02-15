'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Modal } from '@/src/components/ui/Modal';
import { useAccounts } from '@/src/hooks/useAccount';
import { formatMoney } from '@/src/lib/format';
import { cx } from '@/src/lib/ui';

export default function AccountsSettingsPage() {
  const router = useRouter();
  const s = useAccounts();

  const defaultName = useMemo(() => {
    if (!s.defaultAccountId) return null;
    return s.accounts.find((a) => a.id === s.defaultAccountId)?.name ?? null;
  }, [s.accounts, s.defaultAccountId]);

  const goBack = () => router.push('/dashboard');
  const openAdd = () => s.openAdd();

  return (
    <main className='p-6 space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Accounts</h1>
          <div className='text-sm opacity-80'>
            Manage your trading accounts. Every trade belongs to exactly one
            account.
          </div>

          {defaultName && (
            <div className='text-sm opacity-70'>
              Default account:{' '}
              <span className='font-semibold'>{defaultName}</span>
            </div>
          )}
        </div>

        <div className='flex gap-2'>
          <button className='border rounded-lg px-4 py-2' onClick={goBack}>
            Back
          </button>

          <button className='border rounded-lg px-4 py-2' onClick={openAdd}>
            + Add Account
          </button>
        </div>
      </header>

      {s.pageMsg && <div className='text-sm text-rose-700'>{s.pageMsg}</div>}
      {s.loading && <div className='text-sm opacity-80'>Loading…</div>}

      {!s.loading && (
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
      )}

      {/* Add modal */}
      <Modal
        open={s.showAdd}
        title='Add account'
        onClose={s.closeAdd}>
        <div className='space-y-3'>
          {s.addMsg && <div className='text-sm text-rose-700'>{s.addMsg}</div>}

          <label className='block space-y-1'>
            <div className='text-sm opacity-70'>Name</div>
            <input
              className='w-full border rounded-lg p-3'
              value={s.addName}
              onChange={(e) => s.setAddName(e.target.value)}
              placeholder='e.g., FTMO, Personal, Prop, etc.'
            />
          </label>

          <label className='block space-y-1'>
            <div className='text-sm opacity-70'>Starting Balance</div>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={s.addStartingBalance}
              onChange={(e) => s.setAddStartingBalance(e.target.value)}
              placeholder='e.g., 100000'
            />
          </label>

          <label className='block space-y-1'>
            <div className='text-sm opacity-70'>Currency (optional)</div>
            <input
              className='w-full border rounded-lg p-3'
              value={s.addCurrency}
              onChange={(e) => s.setAddCurrency(e.target.value)}
              placeholder='e.g., USD'
            />
            <div className='text-xs opacity-60'>
              Leave empty to use USD display formatting.
            </div>
          </label>

          <div className='flex justify-end gap-2 pt-2'>
            <button
              className='border rounded-lg px-4 py-2'
              onClick={s.closeAdd}
              disabled={s.creating}>
              Cancel
            </button>

            <button
              className='border rounded-lg px-4 py-2 disabled:opacity-60'
              onClick={s.onAddAccount}
              disabled={s.creating}>
              {s.creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={!!s.editing} title='Edit account' onClose={s.closeEdit}>
        {s.editing && (
          <div className='space-y-3'>
            {s.editMsg && (
              <div className='text-sm text-rose-700'>{s.editMsg}</div>
            )}

            <label className='block space-y-1'>
              <div className='text-sm opacity-70'>Name</div>
              <input
                className='w-full border rounded-lg p-3'
                value={s.editName}
                onChange={(e) => s.setEditName(e.target.value)}
              />
            </label>

            <label className='block space-y-1'>
              <div className='text-sm opacity-70'>Starting Balance</div>
              <input
                className='w-full border rounded-lg p-3'
                type='number'
                step='0.01'
                value={s.editStartingBalance}
                onChange={(e) => s.setEditStartingBalance(e.target.value)}
              />
            </label>

            <label className='block space-y-1'>
              <div className='text-sm opacity-70'>Currency (optional)</div>
              <input
                className='w-full border rounded-lg p-3'
                value={s.editCurrency}
                onChange={(e) => s.setEditCurrency(e.target.value)}
                placeholder='e.g., USD'
              />
            </label>

            <div className='flex justify-end gap-2 pt-2'>
              <button
                className='border rounded-lg px-4 py-2'
                onClick={s.closeEdit}
                disabled={s.saving}>
                Cancel
              </button>

              <button
                className='border rounded-lg px-4 py-2 disabled:opacity-60'
                onClick={s.onSaveEdit}
                disabled={s.saving}>
                {s.saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete modal */}
      <Modal
        open={!!s.deleteTarget}
        title='Delete account?'
        onClose={s.closeDelete}>
        {s.deleteTarget && (
          <div className='space-y-3'>
            {s.deleteMsg && (
              <div className='text-sm text-rose-700'>{s.deleteMsg}</div>
            )}

            <p className='text-sm opacity-80'>
              This will permanently delete{' '}
              <span className='font-semibold'>{s.deleteTarget.name}</span>.
            </p>

            <p className='text-xs opacity-70'>
              Note: You can only delete an account if it has{' '}
              <span className='font-semibold'>0 trades</span> and it’s not your
              last account.
            </p>

            <div className='flex justify-end gap-2 pt-2'>
              <button
                className='border rounded-lg px-4 py-2'
                onClick={s.closeDelete}
                disabled={s.deleting}>
                Cancel
              </button>

              <button
                className='border rounded-lg px-4 py-2 disabled:opacity-60'
                onClick={s.onConfirmDelete}
                disabled={s.deleting}>
                {s.deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}