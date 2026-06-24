import * as Sentry from '@sentry/nextjs';

// Server + edge error monitoring. Deliberately env-gated: with no
// NEXT_PUBLIC_SENTRY_DSN set, register() returns early and Sentry never
// initializes, so the app builds and runs identically with monitoring off.
// Set the DSN in the environment (one Sentry project) to switch it on.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (
    process.env.NEXT_RUNTIME === 'nodejs' ||
    process.env.NEXT_RUNTIME === 'edge'
  ) {
    Sentry.init({
      dsn,
      // Errors only by default; turn up later if you want performance tracing.
      tracesSampleRate: 0,
      environment: process.env.VERCEL_ENV ?? 'development',
    });
  }
}

// Captures errors thrown in server components / route handlers. No-op when
// Sentry isn't initialized (no DSN).
export const onRequestError = Sentry.captureRequestError;
