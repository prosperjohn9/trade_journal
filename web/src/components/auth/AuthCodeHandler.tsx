'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

/**
 * Catches an auth code that lands on a marketing page instead of /auth/callback
 * (e.g. when Supabase falls back to the Site URL). The supabase client's
 * detectSessionInUrl exchanges the code on load; this just waits for the
 * resulting session and moves the user into the app. No-op when there is no
 * code in the URL, so regular visitors are unaffected.
 */
export function AuthCodeHandler() {
  const router = useRouter();

  useEffect(() => {
    const hasCode = new URLSearchParams(window.location.search).has('code');
    if (!hasCode) return;

    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.replace('/dashboard');
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  return null;
}
