'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { supabase } from '@/src/lib/supabase/client';
import { useRouter } from 'next/navigation';

function readSavedEmail(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('last_magic_email') ?? '';
}

// localStorage doesn't change under us while the auth screen is open, so
// subscribe is a no-op. useSyncExternalStore still gives an SSR-safe read (the
// server snapshot is '') with no hydration mismatch — replacing the old
// "restore email from localStorage inside an effect" pattern.
const subscribeSavedEmail = () => () => {};

export default function AuthPage() {
  const router = useRouter();

  const savedEmail = useSyncExternalStore(
    subscribeSavedEmail,
    readSavedEmail,
    () => '',
  );
  // Local edits win over the saved value; null means "untouched", '' means the
  // user explicitly cleared the field.
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const email = emailDraft ?? savedEmail;
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

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

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();

    if (!trimmed) {
      setMsg('Enter your email.');
      return;
    }

    setSending(true);
    setMsg('Sending magic link...');

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('last_magic_email', trimmed);
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg('Check your email for the login link.');
    } finally {
      setSending(false);
    }
  }

  async function goToAppIfLoggedIn() {
    const { data } = await supabase.auth.getSession();
    if (data.session) router.push('/dashboard');
    else setMsg('No active session yet. Use the magic link from your email.');
  }

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
            <h1 className='text-2xl font-semibold leading-tight'>The Trader&apos;s Hindsight</h1>
            <p className='text-sm text-[var(--text-secondary)]'>
              Make your experience your edge.
            </p>
          </div>
        </div>

        <form onSubmit={signInWithEmail} className='space-y-3'>
          <input
            className='w-full border rounded-lg p-3'
            placeholder='Email address'
            value={email}
            onChange={(e) => setEmailDraft(e.target.value)}
            type='email'
            required
          />
          <button
            className='w-full rounded-lg p-3 border disabled:opacity-60'
            disabled={sending}>
            {sending ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        <button
          onClick={goToAppIfLoggedIn}
          className='w-full rounded-lg p-3 border'>
          I already logged in
        </button>

        {msg && <p className='text-sm opacity-80'>{msg}</p>}

        <p className='text-xs text-[var(--text-muted)]'>
          By signing in or creating an account, you agree to our{' '}
          <a
            href='/terms'
            className='underline hover:text-[var(--text-primary)]'>
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href='/privacy'
            className='underline hover:text-[var(--text-primary)]'>
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}