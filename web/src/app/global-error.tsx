'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Root-layout-level error boundary. Only triggered when the error happens
// inside the root layout itself (extremely rare). Because it replaces the
// layout when it renders, it must include its own <html> and <body>.
//
// Keeping this minimal and inline-styled — at the point this renders we
// can't rely on globals.css having loaded.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report the crash. No-op when Sentry isn't configured (no DSN).
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang='en'>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#0b1220',
          color: '#e5e7eb',
        }}>
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 480 }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.75rem', margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '0.75rem', color: '#9ca3af' }}>
            A critical error stopped this page from loading. Try refreshing —
            your data is safe.
          </p>
          <button
            type='button'
            onClick={() => reset()}
            style={{
              marginTop: '1.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: '#6366f1',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
