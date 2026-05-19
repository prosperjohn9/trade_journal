'use client';

import type { ReactNode } from 'react';

/**
 * Shared empty-state component used wherever a page renders no rows yet
 * (no accounts, no trades, no analytics data, etc.). Keeps these states
 * visually consistent and always paired with a clear next-step CTA.
 */
export function EmptyState({
  icon,
  title,
  body,
  cta,
  secondary,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  cta?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-8 text-center ${className ?? ''}`}>
      {icon && (
        <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-2xl'>
          {icon}
        </div>
      )}
      <h3 className='text-lg font-semibold text-[var(--text-primary)]'>{title}</h3>
      {body && (
        <div className='mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]'>
          {body}
        </div>
      )}
      {(cta || secondary) && (
        <div className='mt-5 flex flex-wrap items-center justify-center gap-2'>
          {cta && (
            <button
              type='button'
              onClick={cta.onClick}
              className='rounded-lg border border-transparent bg-[var(--accent-cta)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110'>
              {cta.label}
            </button>
          )}
          {secondary && (
            <button
              type='button'
              onClick={secondary.onClick}
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
