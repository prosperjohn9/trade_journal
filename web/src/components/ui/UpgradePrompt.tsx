'use client';

import { useRouter } from 'next/navigation';

// Styled plan-gate notice. Shown wherever the API answers with an upgrade-type
// code (feature locked, account limit, AI quota, manual-refresh cap) instead of
// surfacing the raw error string. Uses dashboard theme variables so it reads
// correctly in light and dark.

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      className={className}>
      <path d='M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z' />
      <path d='M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z' />
    </svg>
  );
}

export function UpgradePrompt({
  message,
  compact = false,
}: {
  /** The server's gate message, already user-friendly. */
  message: string;
  /** Tight layout for small containers (chat, modals). */
  compact?: boolean;
}) {
  const router = useRouter();

  if (compact) {
    return (
      <div className='rounded-xl border border-[var(--accent-cta)]/35 bg-[var(--accent-cta)]/[0.07] px-3 py-2.5'>
        <div className='flex items-start gap-2'>
          <SparklesIcon className='mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-cta)]' />
          <div className='min-w-0'>
            <p className='text-xs text-[var(--text-secondary)]'>{message}</p>
            <button
              type='button'
              onClick={() => router.push('/settings/billing')}
              className='mt-1.5 text-xs font-semibold text-[var(--accent-cta)] underline-offset-2 hover:underline'>
              View plans
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='rounded-xl border border-[var(--accent-cta)]/35 bg-[var(--accent-cta)]/[0.07] p-4'>
      <div className='flex items-start gap-3'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-cta)]/15'>
          <SparklesIcon className='h-5 w-5 text-[var(--accent-cta)]' />
        </span>
        <div className='min-w-0'>
          <p className='text-sm font-semibold text-[var(--text-primary)]'>
            Plan limit reached
          </p>
          <p className='mt-0.5 text-sm text-[var(--text-secondary)]'>{message}</p>
          <button
            type='button'
            onClick={() => router.push('/settings/billing')}
            className='mt-3 inline-flex items-center rounded-lg bg-[var(--accent-cta)] px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110'>
            View plans
          </button>
        </div>
      </div>
    </div>
  );
}
