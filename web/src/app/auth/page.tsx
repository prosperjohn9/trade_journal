'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  // If already logged in, bypass this page
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace('/dashboard');
    })();
  }, [router]);

  // Auto-fill email if user previously requested a magic link
  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('last_magic_email')
        : null;

    if (saved && !email) setEmail(saved);
  }, [email]);

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg('Sending magic link...');

    try {
      // Save for auto-fill next time
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('last_magic_email', email.trim());
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // Clicking the email link will go to this route, then you redirect to /dashboard there
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
  }

  return (
    <main className='min-h-screen flex items-center justify-center p-6'>
      <div className='w-full max-w-md border rounded-xl p-6 space-y-4'>
        <h1 className='text-2xl font-semibold'>Trade Journal</h1>

        <form onSubmit={signInWithEmail} className='space-y-3'>
          <input
            className='w-full border rounded-lg p-3'
            placeholder='Email address'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
      </div>
    </main>
  );
}