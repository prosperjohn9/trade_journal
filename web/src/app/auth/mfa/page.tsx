'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost } from '@/src/lib/api/fetcher';

// The second-factor challenge, shown only to users who enrolled a TOTP factor.
// If a session somehow lands here without needing elevation, we bounce straight
// to the app, so this page is harmless for everyone else.
export default function MfaChallengePage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [recoveryCode, setRecoveryCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      // No elevation needed (no factor, or already verified) -> into the app.
      if (!aal || aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') {
        router.replace('/dashboard');
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const totp = factors?.totp?.find((f) => f.status === 'verified');
      if (!totp) {
        // Enrolled-but-unverified edge: nothing to challenge, let them in.
        router.replace('/dashboard');
        return;
      }
      setFactorId(totp.id);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || busy) return;
    setErr('');
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (error) {
        setErr('That code did not match. Check your authenticator and try again.');
        return;
      }
      router.replace('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  async function recover(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !recoveryCode.trim()) return;
    setErr('');
    setBusy(true);
    try {
      await apiPost('/api/auth/mfa/recover', { code: recoveryCode.trim() });
      // 2FA is now off (factor removed); the user is back in and can re-enroll.
      router.replace('/dashboard');
    } catch (e2) {
      setErr(
        e2 instanceof Error
          ? e2.message
          : 'That recovery code is invalid or already used.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    await supabase.auth.signOut();
    router.replace('/auth');
  }

  return (
    <main className='flex min-h-screen items-center justify-center bg-[var(--bg-app)] px-4'>
      <div className='w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6'>
        <h1 className='text-xl font-semibold text-[var(--text-primary)]'>
          Two-factor verification
        </h1>
        <p className='mt-1 text-sm text-[var(--text-secondary)]'>
          {mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app to finish signing in.'
            : 'Lost your authenticator? Enter a backup recovery code. This turns 2FA off so you can sign in and set it up again.'}
        </p>

        {mode === 'totp' ? (
          <form onSubmit={verify} className='mt-5 space-y-3'>
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode='numeric'
              autoComplete='one-time-code'
              autoFocus
              placeholder='123456'
              disabled={!ready || busy}
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-center text-lg tracking-[0.4em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
            />
            {err ? <p className='text-xs text-[var(--loss)]'>{err}</p> : null}
            <button
              type='submit'
              disabled={!ready || busy || code.length < 6}
              className='w-full rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        ) : (
          <form onSubmit={recover} className='mt-5 space-y-3'>
            <input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              autoFocus
              placeholder='XXXXX-XXXXX'
              disabled={busy}
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-center font-mono tracking-[0.2em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
            />
            {err ? <p className='text-xs text-[var(--loss)]'>{err}</p> : null}
            <button
              type='submit'
              disabled={busy || !recoveryCode.trim()}
              className='w-full rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
              {busy ? 'Recovering…' : 'Recover access'}
            </button>
          </form>
        )}

        <div className='mt-4 flex flex-col gap-2'>
          <button
            onClick={() => {
              setErr('');
              setMode(mode === 'totp' ? 'recovery' : 'totp');
            }}
            className='text-left text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline'>
            {mode === 'totp'
              ? 'Lost your authenticator? Use a recovery code'
              : 'Back to authenticator code'}
          </button>
          <button
            onClick={() => void switchAccount()}
            className='text-left text-xs text-[var(--text-muted)] underline-offset-2 hover:underline'>
            Sign in with a different account
          </button>
        </div>
      </div>
    </main>
  );
}
