import { supabase } from '@/src/lib/supabase/client';

// Where to send a user right after a successful password/OAuth sign-in. If they
// have enrolled a second factor, Supabase reports the session needs elevation
// (nextLevel 'aal2' while currentLevel is still 'aal1'), so we route to the MFA
// challenge; otherwise straight to the app. Two-factor is opt-in, so users with
// no factor never see the challenge.
export async function nextRouteAfterAuth(
  fallback = '/dashboard',
): Promise<string> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      data &&
      data.nextLevel === 'aal2' &&
      data.currentLevel !== data.nextLevel
    ) {
      return '/auth/mfa';
    }
  } catch {
    // If the check fails, fall through; the user is signed in at aal1.
  }
  return fallback;
}
