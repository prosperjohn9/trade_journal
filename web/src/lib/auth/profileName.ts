// Deriving a human display name from a Supabase auth identity. Google OAuth
// fills user_metadata.full_name / name; our email sign-up writes display_name
// into user_metadata via the signUp options. The greeting prefers an explicit
// profile name the user set, then the auth-metadata name, then the email
// local-part, and only falls back to a neutral default when nothing else fits.

type AuthLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** First usable name from the auth user's identity metadata, or null. */
export function nameFromAuthUser(user: AuthLike): string | null {
  const meta = user.user_metadata ?? {};
  for (const key of ['display_name', 'full_name', 'name'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Resolve the name shown in "Signed in as ..." through a sensible fallback
 *  chain so it is never an anonymous "Trader" when we know who the user is. */
export function resolveGreetingName(opts: {
  profileName?: string | null;
  authName?: string | null;
  email?: string | null;
}): string {
  if (opts.profileName && opts.profileName.trim()) return opts.profileName.trim();
  if (opts.authName && opts.authName.trim()) return opts.authName.trim();
  const local = opts.email?.split('@')[0]?.trim();
  if (local) return local;
  return 'Trader';
}
