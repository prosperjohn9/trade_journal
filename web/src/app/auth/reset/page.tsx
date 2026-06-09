'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

// Landed here after clicking the password-reset email link. The /auth/callback
// handler has already exchanged the recovery code for a session, so we just
// confirm a session exists and let the user set a new password.

type Ready = 'checking' | 'ok' | 'nosession';
type Tone = 'error' | 'info';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<Ready>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tone, setTone] = useState<Tone>('info');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled) setReady(data.session ? 'ok' : 'nosession');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function note(text: string, t: Tone = 'info') {
    setTone(t);
    setMsg(text);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      note('Use at least 8 characters.', 'error');
      return;
    }
    if (password !== confirm) {
      note('Passwords do not match.', 'error');
      return;
    }
    setBusy(true);
    note('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        note(error.message, 'error');
        return;
      }
      note('Password updated. Taking you in…', 'info');
      router.replace('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className='min-h-screen flex items-center justify-center p-6'>
      <div className='w-full max-w-md border rounded-xl p-6 space-y-4'>
        <h1 className='text-xl font-semibold'>Set a new password</h1>

        {ready === 'checking' && (
          <p className='text-sm opacity-80'>Loading…</p>
        )}

        {ready === 'nosession' && (
          <div className='space-y-3'>
            <p className='text-sm text-red-600'>
              This reset link is invalid or has expired.
            </p>
            <a
              href='/auth'
              className='inline-block rounded-lg border p-3 text-sm font-medium'>
              Request a new link
            </a>
          </div>
        )}

        {ready === 'ok' && (
          <form onSubmit={handleSubmit} className='space-y-3'>
            <input
              className='w-full border rounded-lg p-3'
              placeholder='New password'
              aria-label='New password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type='password'
              autoComplete='new-password'
              minLength={8}
              required
            />
            <input
              className='w-full border rounded-lg p-3'
              placeholder='Confirm new password'
              aria-label='Confirm new password'
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type='password'
              autoComplete='new-password'
              minLength={8}
              required
            />
            <button
              type='submit'
              className='w-full rounded-lg p-3 border font-medium disabled:opacity-60'
              disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}

        {msg && ready === 'ok' && (
          <p
            className={
              tone === 'error' ? 'text-sm text-red-600' : 'text-sm opacity-80'
            }>
            {msg}
          </p>
        )}
      </div>
    </main>
  );
}
