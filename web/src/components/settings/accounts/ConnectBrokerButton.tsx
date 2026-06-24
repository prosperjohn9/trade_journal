'use client';

import { useState } from 'react';
import { apiPost } from '@/src/lib/api/fetcher';
import { createAccount } from '@/src/lib/services/accounts.service';
import {
  ACCOUNT_TYPES,
  normalizeAccountTags,
  type AccountType,
} from '@/src/domain/account';

const inputClass =
  'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]';

/** Header action: create a brand-new trading account AND link it to a broker
 *  for auto-sync in one step (the user just adds an account name). */
export function ConnectBrokerButton({
  onCreated,
}: {
  onCreated?: (accountId?: string, accountType?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [server, setServer] = useState('');
  const [password, setPassword] = useState('');
  const [platform, setPlatform] = useState<'mt5' | 'mt4'>('mt5');
  const [accountType, setAccountType] = useState<AccountType>('Challenge');
  const [tagsInput, setTagsInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function openModal() {
    setName('');
    setLogin('');
    setServer('');
    setPassword('');
    setPlatform('mt5');
    setAccountType('Challenge');
    setTagsInput('');
    setMsg(null);
    setDone(false);
    setOpen(true);
  }

  async function submit() {
    setMsg(null);
    if (!name.trim() || !login.trim() || !server.trim() || !password) {
      setMsg('Account name, login, server and investor password are all required.');
      return;
    }
    setBusy(true);
    try {
      const account = await createAccount({
        name: name.trim(),
        account_type: accountType,
        tags: normalizeAccountTags(tagsInput),
        starting_balance: 0,
        base_currency: null,
      });
      await apiPost('/api/integrations/metatrader/connect', {
        account_id: account.id,
        login: login.trim(),
        server: server.trim(),
        password,
        platform,
      });
      setPassword('');
      setDone(true);
      setMsg(
        'Account created and linking to your broker. Give it a minute, then open the account below and tap "Sync now".',
      );
      onCreated?.(account.id, accountType);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
        onClick={openModal}>
        Connect MetaTrader
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'
          onClick={() => {
            if (!busy) setOpen(false);
          }}>
          <div
            className='w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold'>Connect a MetaTrader account</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={() => !busy && setOpen(false)}
                aria-label='Close'>
                ✕
              </button>
            </div>

            {done ? (
              <p className='mt-4 rounded-lg bg-[var(--surface-muted)] px-3 py-3 text-sm text-[var(--text-secondary)]'>
                {msg}
              </p>
            ) : (
              <div className='mt-4 space-y-3'>
                <p className='text-sm text-[var(--text-secondary)]'>
                  We create the trading account and link it to your broker with
                  its{' '}
                  <strong className='text-[var(--text-primary)]'>
                    investor (read-only) password
                  </strong>
                  . We can never place trades or withdraw.
                </p>
                <label className='block'>
                  <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                    Account name
                  </span>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder='e.g. FundingPips 10K'
                  />
                </label>
                <div className='grid grid-cols-2 gap-3'>
                  <label className='block'>
                    <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                      Account type
                    </span>
                    <select
                      className={inputClass}
                      value={accountType}
                      onChange={(e) =>
                        setAccountType(e.target.value as AccountType)
                      }>
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className='block'>
                    <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                      Tags (comma-separated)
                    </span>
                    <input
                      className={inputClass}
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder='10k, Phase 1'
                    />
                  </label>
                </div>
                <label className='block'>
                  <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                    Login
                  </span>
                  <input
                    className={inputClass}
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder='e.g. 12179330'
                  />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                    Server
                  </span>
                  <input
                    className={inputClass}
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    placeholder='e.g. FundingPips2-SIM'
                  />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                    Investor password (read-only)
                  </span>
                  <input
                    type='password'
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder='Read-only password'
                  />
                </label>
                <label className='block'>
                  <span className='mb-1 block text-xs font-medium text-[var(--text-muted)]'>
                    Platform
                  </span>
                  <select
                    className={inputClass}
                    value={platform}
                    onChange={(e) =>
                      setPlatform(e.target.value === 'mt4' ? 'mt4' : 'mt5')
                    }>
                    <option value='mt5'>MetaTrader 5</option>
                    <option value='mt4'>MetaTrader 4</option>
                  </select>
                </label>
                <button
                  className='w-full rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'
                  onClick={() => void submit()}
                  disabled={busy}>
                  {busy ? 'Creating & connecting…' : 'Create & connect'}
                </button>
                {msg ? (
                  <p className='rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-secondary)]'>
                    {msg}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
