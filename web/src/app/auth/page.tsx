'use client';

import { useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const router = useRouter();

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setMsg('Sending magic link...');

    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) return setMsg(error.message);

    setMsg('Check your email for the login link.');
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
          <button className='w-full rounded-lg p-3 border'>
            Send magic link
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