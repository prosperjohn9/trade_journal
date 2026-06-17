// The owner/admin allowlist, from the ADMIN_EMAILS env var (comma-separated).
// Admins get unlimited synced accounts and full features without a subscription,
// and are exempt from the synced-account cap enforcement. Server-only: reads a
// non-public env var, so never import this into a Client Component.

import type { SupabaseClient } from '@supabase/supabase-js';

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** User ids whose email is in the admin allowlist. Needs a service-role client
 *  (it lists auth users). Best-effort: returns an empty set on any failure. */
export async function adminUserIdSet(
  sb: SupabaseClient,
): Promise<Set<string>> {
  const allowed = adminEmails();
  const ids = new Set<string>();
  if (!allowed.length) return ids;
  try {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email && allowed.includes(u.email.toLowerCase())) ids.add(u.id);
    }
  } catch {
    // best-effort
  }
  return ids;
}
