'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

function CallbackInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [msg, setMsg] = useState('Completing sign-in...');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const code = sp.get('code');

        if (!code) {
          setMsg(
            'Missing code. Please re-open the magic link from your email.',
          );
          timeoutRef.current = window.setTimeout(() => {
            if (!cancelled) router.replace('/auth');
          }, 1200);
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        if (!cancelled) router.replace('/dashboard');
      } catch (e: unknown) {
        const message =
          e instanceof Error
            ? e.message
            : 'Failed to complete sign-in. Please try again.';

        if (!cancelled) {
          setMsg(message);
          timeoutRef.current = window.setTimeout(() => {
            if (!cancelled) router.replace('/auth');
          }, 1200);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [router, sp]);

  return (
    <main className='min-h-screen flex items-center justify-center p-6'>
      <div className='w-full max-w-md border rounded-xl p-6'>
        <h1 className='text-xl font-semibold'>Signing you in…</h1>
        <p className='mt-2 text-sm opacity-80'>{msg}</p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className='min-h-screen flex items-center justify-center p-6'>
          <div className='w-full max-w-md border rounded-xl p-6'>
            <h1 className='text-xl font-semibold'>Signing you in…</h1>
            <p className='mt-2 text-sm opacity-80'>Loading…</p>
          </div>
        </main>
      }>
      <CallbackInner />
    </Suspense>
  );
}