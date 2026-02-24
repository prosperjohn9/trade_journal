export function getErr(
  err: unknown,
  fallback = 'Something went wrong',
): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err || fallback;

  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown };
    if (typeof anyErr.message === 'string') return anyErr.message || fallback;
  }
  return fallback;
}