// Deriving the name we greet a user by from their Supabase auth identity.
// Google OAuth fills user_metadata (given_name / full_name / name); our email
// sign-up optionally writes display_name. The greeting prefers a display name
// the user chose, then their first name from Google, and otherwise stays
// neutral ("Trader") rather than guessing from their email handle.

type AuthLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/** A name to greet the user by, from their auth identity, or null. An explicit
 *  display name (typed at sign-up or set in Settings) is returned verbatim,
 *  numbers and all. A name we only have from Google is reduced to just the
 *  first name ("Prosper Osaigbovo" -> "Prosper"). */
export function nameFromAuthUser(user: AuthLike): string | null {
  const meta = user.user_metadata ?? {};

  const explicit = meta.display_name;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const given = meta.given_name;
  if (typeof given === 'string' && given.trim()) return given.trim();

  for (const key of ['full_name', 'name'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) {
      const first = v.trim().split(/\s+/)[0];
      if (first) return first;
    }
  }
  return null;
}

/** Resolve the name shown in "Signed in as ...". A display name the user chose
 *  wins, then their first name from Google. If they set neither, we greet them
 *  neutrally rather than exposing their email handle. */
export function resolveGreetingName(opts: {
  profileName?: string | null;
  authName?: string | null;
}): string {
  if (opts.profileName && opts.profileName.trim()) return opts.profileName.trim();
  if (opts.authName && opts.authName.trim()) return opts.authName.trim();
  return 'Trader';
}
