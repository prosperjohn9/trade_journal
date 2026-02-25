'use client';

import React from 'react';

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
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
        className='relative w-full max-w-lg rounded-xl border p-4 shadow-lg'
        style={{
          backgroundColor: 'var(--bg-surface, #ffffff)',
          borderColor: 'var(--border-default, #e2e8f0)',
          color: 'var(--text-primary, #0f172a)',
        }}>
        <div className='flex items-start justify-between gap-3'>
          <div className='text-lg font-semibold'>{title}</div>
          <button
            className='rounded-lg border px-3 py-1 text-sm'
            style={{
              borderColor: 'var(--border-default, #e2e8f0)',
              color: 'var(--text-secondary, #475569)',
            }}
            onClick={onClose}>
            ✕
          </button>
        </div>
        <div className='mt-3'>{children}</div>
      </div>
    </div>
  );
}
