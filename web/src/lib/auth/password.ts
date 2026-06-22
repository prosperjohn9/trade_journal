// Mirrors the Supabase Auth password policy (min length 8 + lower/upper/digit/
// symbol) so the sign-up and reset forms can tell users the rules and validate
// before submitting, instead of letting them bounce off a server-side rejection.

export const PASSWORD_RULE_TEXT =
  'At least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.';

export type PasswordCheck = { ok: boolean; missing: string[] };

export function checkPassword(pw: string): PasswordCheck {
  const missing: string[] = [];
  if (pw.length < 8) missing.push('at least 8 characters');
  if (!/[a-z]/.test(pw)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(pw)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(pw)) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) missing.push('a symbol');
  return { ok: missing.length === 0, missing };
}

/** A short "Password needs ..." message from the missing requirements. */
export function passwordError(pw: string): string | null {
  const { ok, missing } = checkPassword(pw);
  if (ok) return null;
  return `Password needs ${missing.join(', ')}.`;
}
