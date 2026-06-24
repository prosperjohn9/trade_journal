import * as Sentry from '@sentry/nextjs';

// Client-side error monitoring, env-gated like the server side. No-op when
// NEXT_PUBLIC_SENTRY_DSN is unset.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
