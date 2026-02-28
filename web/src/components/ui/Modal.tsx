'use client';

import React from 'react';
import { cx } from '@/src/lib/utils/ui';

export function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  contentClassName,
  titleClassName,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  contentClassName?: string;
  titleClassName?: string;
}) {
  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center p-4'
      aria-modal='true'
      role='dialog'>
      <button
        className='absolute inset-0 bg-black/40'
        onClick={onClose}
        aria-label='Close modal'
      />
      <div
        className='relative w-full max-w-lg rounded-xl border p-6 shadow-[0_24px_50px_rgba(15,23,42,0.24)]'
        style={{
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderColor: 'var(--border-default, #e2e8f0)',
          color: 'var(--text-primary, #0f172a)',
        }}>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <div className={cx('text-lg font-semibold', titleClassName)}>{title}</div>
            {subtitle && (
              <p
                className='mt-1 text-sm'
                style={{ color: 'var(--text-secondary, #475569)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            className='rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
            style={{
              borderColor: 'var(--border-default, #e2e8f0)',
              color: 'var(--text-secondary, #475569)',
            }}
            onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={cx('mt-5', contentClassName)}>{children}</div>
      </div>
    </div>
  );
}