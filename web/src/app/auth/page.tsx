'use client';

import {
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { passwordError, PASSWORD_RULE_TEXT } from '@/src/lib/auth/password';
import { nextRouteAfterAuth } from '@/src/lib/auth/postAuth';

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

function CheckIcon() {
  return (
    <svg
      viewBox='0 0 20 20'
      className='mt-0.5 h-4 w-4 shrink-0 text-indigo-300'
      fill='none'
      aria-hidden='true'>
      <circle cx='10' cy='10' r='9' className='fill-indigo-500/15' />
      <path
        d='M6 10.2l2.6 2.6L14 7.4'
        stroke='currentColor'
        strokeWidth='1.8'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

const SIGNUP_PERKS = [
  'Free statement import and cTrader auto-sync',
  'Your Hindsight Report in minutes, not spreadsheets',
  'No card required to start',
];

// Full-bleed dark backdrop that matches the marketing side, with a soft glow
// behind the card. Shown on its own as the Suspense fallback so the page never
// flashes blank while the search params resolve.
function AuthBackdrop({ children }: { children?: ReactNode }) {
  return (
    <main className='relative min-h-screen overflow-hidden bg-[#0b1220] text-slate-100 antialiased'>
      <div
        aria-hidden
        className='pointer-events-none absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-[130px]'
      />
      {children}
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthBackdrop />}>
      <AuthForm />
    </Suspense>
  );
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const savedEmail = useSyncExternalStore(
    subscribeSavedEmail,
    readSavedEmail,
    () => '',
  );
  // Local edits win over the saved value; null means "untouched".
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const email = emailDraft ?? savedEmail;

  // The entry point sets the starting view: "Get started" links land on signup,
  // "Sign in" links land on signin. In-page toggling takes over from there.
  const [mode, setMode] = useState<Mode>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'signin',
  );
  const [name, setName] = useState('');
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
    if (mode === 'signup') {
      const pwErr = passwordError(password);
      if (pwErr) {
        note(pwErr, 'error');
        return;
      }
    } else if (!password) {
      note('Enter your password.', 'error');
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
        router.replace(await nextRouteAfterAuth());
        return;
      }

      // Sign up.
      const { data, error } = await supabase.auth.signUp({
        email: mail,
        password,
        options: {
          // Optional: only stored when given, and read back when we seed the
          // profile so the dashboard greets them by the name they chose.
          data: name.trim() ? { display_name: name.trim() } : undefined,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
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
        redirectTo: `${window.location.origin}/auth/reset`,
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

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-indigo-400/70 focus:bg-white/[0.07]';

  return (
    <AuthBackdrop>
      <div className='relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12'>
        <Link
          href='/'
          className='mb-8 flex items-center justify-center gap-2.5 transition-opacity hover:opacity-90'>
          <Image
            src='/logo-mark-dark.png'
            alt=''
            width={44}
            height={44}
            priority
            className='h-11 w-11'
          />
          <span className='text-lg font-semibold text-white'>
            The Trader&apos;s Hindsight
          </span>
        </Link>

        <div className='rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl backdrop-blur-sm'>
          <h1 className='text-2xl font-semibold tracking-tight text-white'>
            {signingIn ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className='mt-1.5 text-sm text-slate-400'>
            {signingIn
              ? 'Sign in to pick up where you left off.'
              : 'See in dollars what your trading habits cost you. Free to start.'}
          </p>

          {!signingIn && (
            <ul className='mt-5 space-y-2.5'>
              {SIGNUP_PERKS.map((perk) => (
                <li
                  key={perk}
                  className='flex items-start gap-2.5 text-sm text-slate-300'>
                  <CheckIcon />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          )}

          <button
            type='button'
            onClick={() => void signInWithProvider('google')}
            disabled={oauthLoading !== null}
            className='mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60'>
            <GoogleIcon />
            {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className='my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-500'>
            <span className='h-px flex-1 bg-white/10' />
            or use your email
            <span className='h-px flex-1 bg-white/10' />
          </div>

          <form onSubmit={handleSubmit} className='space-y-3'>
            {!signingIn && (
              <input
                className={inputClass}
                placeholder='Display name (optional)'
                aria-label='Display name'
                value={name}
                onChange={(e) => setName(e.target.value)}
                type='text'
                autoComplete='nickname'
                maxLength={40}
              />
            )}
            <input
              className={inputClass}
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
                className={`${inputClass} pr-16`}
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
                className='absolute inset-y-0 right-0 px-3.5 text-xs font-medium text-slate-400 hover:text-white'>
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>

            {!signingIn && (
              <p className='text-xs leading-relaxed text-slate-500'>
                {PASSWORD_RULE_TEXT}
              </p>
            )}

            {signingIn && (
              <div className='text-right'>
                <button
                  type='button'
                  onClick={() => void handleForgot()}
                  disabled={busy}
                  className='text-xs text-slate-400 transition-colors hover:text-white disabled:opacity-60'>
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type='submit'
              className='w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-400 disabled:opacity-60'
              disabled={busy}>
              {busy
                ? 'Please wait…'
                : signingIn
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          {msg && (
            <p
              className={
                tone === 'error'
                  ? 'mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200'
                  : 'mt-4 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-3 py-2 text-sm text-indigo-100'
              }>
              {msg}
            </p>
          )}

          <p className='mt-5 text-center text-sm text-slate-400'>
            {signingIn ? 'New here? ' : 'Already have an account? '}
            <button
              type='button'
              onClick={() => {
                setMode(signingIn ? 'signup' : 'signin');
                note('');
              }}
              className='font-semibold text-indigo-300 underline-offset-2 transition-colors hover:text-indigo-200 hover:underline'>
              {signingIn ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className='mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500'>
          <svg
            viewBox='0 0 20 20'
            className='h-3.5 w-3.5 text-slate-500'
            fill='currentColor'
            aria-hidden='true'>
            <path d='M10 1l7 3v5c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V4l7-3z' />
          </svg>
          We connect read-only. We can never place trades or move your funds.
        </p>

        <p className='mt-3 text-center text-xs text-slate-500'>
          By continuing you agree to our{' '}
          <Link
            href='/terms'
            className='underline underline-offset-2 hover:text-slate-300'>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href='/privacy'
            className='underline underline-offset-2 hover:text-slate-300'>
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </AuthBackdrop>
  );
}
