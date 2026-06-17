// The owner/admin allowlist, from the ADMIN_EMAILS env var (comma-separated).
// Admins get unlimited synced accounts and full features without a subscription,
// and are exempt from the synced-account cap enforcement. Server-only: reads a
// non-public env var, so never import this into a Client Component.

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
