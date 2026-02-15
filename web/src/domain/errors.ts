// src/domain/errors.ts

export function getErr(e: unknown, fallback: string): string {
  if (!e || typeof e !== 'object') return fallback;

  const obj = e as Record<string, unknown>;

  const pick = (key: string): string => {
    const v = obj[key];
    return typeof v === 'string' ? v.trim() : '';
  };

  return (
    pick('message') ||
    pick('error') ||
    pick('details') ||
    pick('hint') ||
    fallback
  );
}