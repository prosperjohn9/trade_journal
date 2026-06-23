'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';

// Paths that never require an authenticated session. We skip the check here so a
// logged-out visitor is never bounced, and the /auth/* flow (including the
// challenge page itself) is never interrupted.
const PUBLIC_PREFIXES = [
  '/auth',
  '/privacy',
  '/terms',
  '/cookies',
  '/contact',
  '/refunds',
];

function isPublic(path: string): boolean {
  if (path === '/') return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

// Re-challenges any signed-in session that has an enrolled second factor but is
// still at aal1, e.g. it was open before the user turned on 2FA, or they closed
// the tab mid-challenge. Sign-in already routes through /auth/mfa; this closes
// the gap for sessions that never re-logged-in. No factor, or already aal2, is a
// no-op, so users without 2FA never notice it.
export function MfaGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || isPublic(pathname)) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled || !data) return;
      if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
        router.replace('/auth/mfa');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
