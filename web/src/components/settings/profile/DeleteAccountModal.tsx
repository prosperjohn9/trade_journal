'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

const CONFIRM_PHRASE = 'delete my account';

type State = 'idle' | 'deleting' | 'error';

export function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input when opened, reset state when closed.
  useEffect(() => {
    if (!open) {
      setTyped('');
      setState('idle');
      setErrorMessage(null);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape closes (unless mid-delete — don't let user accidentally bail out
  // halfway through the network call).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state !== 'deleting') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, state, onClose]);

  if (!open) return null;

  const canConfirm =
    typed.trim().toLowerCase() === CONFIRM_PHRASE && state !== 'deleting';

  async function handleDelete() {
    setState('deleting');
    setErrorMessage(null);

    const { error: rpcError } = await supabase.rpc('delete_my_account');

    if (rpcError) {
      console.error('delete_my_account RPC failed:', rpcError);
      setErrorMessage(
        'We couldn\'t delete your account right now. Please try again, or email support@tradershindsight.com.',
      );
      setState('error');
      return;
    }

    // The RPC nuked auth.users for this user, so the session is now invalid.
    // signOut may 401 but we don't care — we just want the cookie cleared.
    try {
      await supabase.auth.signOut();
    } catch {
      // Expected: session is already invalid server-side. Cookie clears anyway.
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm'
      onClick={() => state !== 'deleting' && onClose()}>
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='delete-account-title'
        onClick={(e) => e.stopPropagation()}
        className='w-full max-w-md rounded-xl border border-red-500/40 bg-[var(--bg-surface)] p-6 shadow-2xl'>
        <h2
          id='delete-account-title'
          className='text-lg font-semibold text-red-400'>
          Delete your account?
        </h2>
        <p className='mt-2 text-sm leading-relaxed text-[var(--text-secondary)]'>
          This will permanently delete your account, all trades, trading
          accounts, setups, screenshots, and other personal data. We cannot
          recover anything after this action.
        </p>

        <label
          htmlFor='delete-confirm'
          className='mt-5 block text-sm text-[var(--text-secondary)]'>
          Type{' '}
          <span className='font-mono font-semibold text-red-300'>
            {CONFIRM_PHRASE}
          </span>{' '}
          to confirm:
        </label>
        <input
          ref={inputRef}
          id='delete-confirm'
          type='text'
          autoComplete='off'
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={state === 'deleting'}
          className='mt-2 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-red-400/60 focus:outline-none focus:ring-2 focus:ring-red-500/20'
          placeholder={CONFIRM_PHRASE}
        />

        {state === 'error' && errorMessage && (
          <div className='mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200'>
            {errorMessage}
          </div>
        )}

        <div className='mt-6 flex justify-end gap-2'>
          <button
            type='button'
            onClick={onClose}
            disabled={state === 'deleting'}
            className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:opacity-60'>
            Cancel
          </button>
          <button
            type='button'
            onClick={handleDelete}
            disabled={!canConfirm}
            className='rounded-lg border border-red-500/60 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50'>
            {state === 'deleting' ? 'Deleting...' : 'Delete account'}
          </button>
        </div>
      </div>
    </div>
  );
}
