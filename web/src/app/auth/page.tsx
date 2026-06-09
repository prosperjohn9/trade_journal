'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { supabase } from '@/src/lib/supabase/client';
import { useRouter } from 'next/navigation';

function readSavedEmail(): string {
  if (typeof window === 'undefined') return '';
  return (
    window.localStorage.getItem('last_auth_email') ??
    window.localStorage.getItem('last_magic_email') ??
    ''
  );
}

// localStorage doesn't change under us while the auth screen is open, so
// subscribe is a no-op. useSyncExternalStore still gives an SSR-safe read (the
// server snapshot is '') with no hydration mismatch.
const subscribeSavedEmail = () => () => {};

type Mode = 'signin' | 'signup';
type Tone = 'error' | 'info';

function GoogleIcon() {
  return (
    <svg viewBox='0 0 24 24' className='h-5 w-5' aria-hidden='true'>
      <path
        fill='#4285F4'
        d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z'
      />
      <path
        fill='#34A853'
        d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z'
      />
      <path
        fill='#FBBC05'
        d='M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z'
      />
      <path
        fill='#EA4335'
        d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z'
      />
    </svg>
  );
}

export default function AuthPage() {
  const router = useRouter();

  const savedEmail = useSyncExternalStore(
    subscribeSavedEmail,
    readSavedEmail,
    () => '',
  );
  // Local edits win over the saved value; null means "untouched".
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const email = emailDraft ?? savedEmail;

  const [mode, setMode] = useState<Mode>('signin');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | null>(null);
  const [msg, setMsg] = useState('');
  const [tone, setTone] = useState<Tone>('info');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) router.replace('/dashboard');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function note(text: string, t: Tone = 'info') {
    setTone(t);
    setMsg(text);
  }

  function rememberEmail(value: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('last_auth_email', value);
    }
  }

  async function signInWithProvider(provider: 'google') {
    note('');
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // On success the browser redirects to the provider; we only land here on
      // error.
      if (error) {
        note(error.message, 'error');
        setOauthLoading(null);
      }
    } catch (e) {
      note(e instanceof Error ? e.message : 'Could not start sign-in.', 'error');
      setOauthLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim();
    if (!mail) {
      note('Enter your email.', 'error');
      return;
    }
    if (password.length < 8) {
      note('Password must be at least 8 characters.', 'error');
      return;
    }

    setBusy(true);
    note('');
    try {
      rememberEmail(mail);

      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: mail,
          password,
        });
        if (error) {
          if (/invalid login credentials/i.test(error.message)) {
            note('Wrong email or password.', 'error');
          } else if (/email not confirmed/i.test(error.message)) {
            note(
              'Confirm your email first, then sign in. Check your inbox for the link.',
              'error',
            );
          } else {
            note(error.message, 'error');
          }
          return;
        }
        router.replace('/dashboard');
        return;
      }

      // Sign up.
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) {
          setMode('signin');
          note('You already have an account. Sign in instead.', 'error');
        } else {
          note(error.message, 'error');
        }
        return;
      }
      // Email confirmation OFF: a session is returned, go straight in.
      if (data.session) {
        router.replace('/dashboard');
        return;
      }
      // Supabase returns a user with no identities when the email already exists
      // (and confirmation is on) so as not to leak which emails are registered.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setMode('signin');
        note('You already have an account. Sign in instead.', 'error');
        return;
      }
      note('Account created. Check your email to confirm, then sign in.', 'info');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot() {
    const mail = email.trim();
    if (!mail) {
      note('Enter your email above first, then tap reset.', 'error');
      return;
    }
    setBusy(true);
    note('');
    try {
      rememberEmail(mail);
      const { error } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });
      if (error) {
        note(error.message, 'error');
        return;
      }
      note('If that email has an account, a reset link is on its way.', 'info');
    } finally {
      setBusy(false);
    }
  }

  const signingIn = mode === 'signin';

  return (
    <main className='min-h-screen flex items-center justify-center p-6'>
      <div className='w-full max-w-md border rounded-xl p-6 space-y-4'>
        <div className='flex items-center gap-3'>
          <Image
            src='/logo-mark-dark.png'
            alt=''
            width={56}
            height={56}
            priority
            className='h-14 w-14'
          />
          <div>
            <h1 className='text-2xl font-semibold leading-tight'>
              The Trader&apos;s Hindsight
            </h1>
            <p className='text-sm text-[var(--text-secondary)]'>
              Make your experience your edge.
            </p>
          </div>
        </div>

        <p className='text-sm font-medium text-[var(--text-secondary)]'>
          {signingIn ? 'Sign in to your account' : 'Create your account'}
        </p>

        <div className='space-y-2'>
          <button
            type='button'
            onClick={() => void signInWithProvider('google')}
            disabled={oauthLoading !== null}
            className='flex w-full items-center justify-center gap-2 rounded-lg border p-3 disabled:opacity-60'>
            <GoogleIcon />
            {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>
        </div>

        <div className='flex items-center gap-3 text-xs text-[var(--text-muted)]'>
          <span className='h-px flex-1 border-t' />
          or use your email
          <span className='h-px flex-1 border-t' />
        </div>

        <form onSubmit={handleSubmit} className='space-y-3'>
          <input
            className='w-full border rounded-lg p-3'
            placeholder='Email address'
            aria-label='Email address'
            value={email}
            onChange={(e) => setEmailDraft(e.target.value)}
            type='email'
            autoComplete='email'
            required
          />

          <div className='relative'>
            <input
              className='w-full border rounded-lg p-3 pr-16'
              placeholder='Password'
              aria-label='Password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPw ? 'text' : 'password'}
              autoComplete={signingIn ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
            <button
              type='button'
              onClick={() => setShowPw((v) => !v)}
              className='absolute inset-y-0 right-0 px-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]'>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>

          {signingIn && (
            <div className='text-right'>
              <button
                type='button'
                onClick={() => void handleForgot()}
                disabled={busy}
                className='text-xs text-[var(--text-muted)] underline hover:text-[var(--text-primary)] disabled:opacity-60'>
                Forgot password?
              </button>
            </div>
          )}

          <button
            type='submit'
            className='w-full rounded-lg p-3 border font-medium disabled:opacity-60'
            disabled={busy}>
            {busy
              ? 'Please wait…'
              : signingIn
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <p className='text-sm text-[var(--text-secondary)]'>
          {signingIn ? "New here? " : 'Already have an account? '}
          <button
            type='button'
            onClick={() => {
              setMode(signingIn ? 'signup' : 'signin');
              note('');
            }}
            className='underline font-medium hover:text-[var(--text-primary)]'>
            {signingIn ? 'Create an account' : 'Sign in'}
          </button>
        </p>

        {msg && (
          <p
            className={
              tone === 'error'
                ? 'text-sm text-red-600'
                : 'text-sm opacity-80'
            }>
            {msg}
          </p>
        )}

        <p className='text-xs text-[var(--text-muted)]'>
          By signing in or creating an account, you agree to our{' '}
          <a href='/terms' className='underline hover:text-[var(--text-primary)]'>
            Terms of Service
          </a>{' '}
          and{' '}
          <a href='/privacy' className='underline hover:text-[var(--text-primary)]'>
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
