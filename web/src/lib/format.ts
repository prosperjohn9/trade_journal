function normalizeCurrencyCode(
  input: string | null | undefined,
): string | null {
  if (!input) return null;

  const v = input.trim().toUpperCase();

  // Must be 3 letters (ISO 4217)
  if (!/^[A-Z]{3}$/.test(v)) return null;

  return v;
}

export function formatMoney(amount: number, currency = 'USD'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  const normalized = normalizeCurrencyCode(currency) ?? 'USD';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  } catch {
    // If Intl still rejects it for any reason, fall back safely.
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }
}

export function toIsoCurrencyOrNull(
  input: string | null | undefined,
): string | null {
  return normalizeCurrencyCode(input);
}