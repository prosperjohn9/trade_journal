'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { passwordError, PASSWORD_RULE_TEXT } from '@/src/lib/auth/password';

// Landed here from the password-reset email link. The link carries a PKCE code
// (or detectSessionInUrl has already established the recovery session); we
// confirm or establish the session here, then let the user set a new password.

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
      // A session may already exist (user signed in, or detectSessionInUrl
      // handled the link).
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) setReady('ok');
        return;
      }

      const url = new URL(window.location.href);
      const errDesc = url.searchParams.get('error_description');
      if (errDesc) {
        if (!cancelled) {
          setTone('error');
          setMsg(errDesc);
          setReady('nosession');
        }
        return;
      }

      // PKCE recovery link: exchange the code for a recovery session.
      const code = url.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          // detectSessionInUrl may have already consumed the code; re-check.
          const { data: after } = await supabase.auth.getSession();
          setReady(after.session ? 'ok' : 'nosession');
        } else {
          setReady('ok');
        }
        return;
      }

      if (!cancelled) setReady('nosession');
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
    const pwErr = passwordError(password);
    if (pwErr) {
      note(pwErr, 'error');
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
              {msg || 'This reset link is invalid or has expired.'}
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
            <p className='text-xs leading-relaxed opacity-70'>
              {PASSWORD_RULE_TEXT}
            </p>
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
