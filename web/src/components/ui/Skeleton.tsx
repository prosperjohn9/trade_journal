'use client';

import { cx } from '@/src/lib/utils/ui';

type SkeletonProps = { className?: string };

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cx(
        'animate-pulse rounded-md bg-[var(--border-default)]',
        className,
      )}
    />
  );
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cx(
        'rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4',
        className,
      )}>
      <Skeleton className='mb-2 h-3 w-1/2' />
      <Skeleton className='h-6 w-3/4' />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className='flex gap-3 py-2'>
      <Skeleton className='h-4 w-1/5' />
      <Skeleton className='h-4 w-1/5' />
      <Skeleton className='h-4 w-1/6' />
      <Skeleton className='h-4 w-1/6' />
      <Skeleton className='h-4 flex-1' />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className='space-y-4'>
      {/* KPI cards */}
      <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Trades table */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
        <Skeleton className='mx-auto mb-4 h-5 w-24' />
        <div className='divide-y divide-[var(--border-default)]'>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Equity curve placeholder */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
        <Skeleton className='mb-3 h-4 w-48' />
        <Skeleton className='h-48 w-full' />
      </div>

      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Chart pair */}
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
            <Skeleton className='mb-3 h-4 w-36' />
            <Skeleton className='h-36 w-full' />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TradeViewSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Title */}
      <Skeleton className='h-7 w-48' />

      {/* Stat cards */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Notes block */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-2'>
        <Skeleton className='h-4 w-24' />
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-4 w-5/6' />
      </div>

      {/* Checklist block */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3'>
        <Skeleton className='h-4 w-32' />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='flex items-center gap-3'>
            <Skeleton className='h-4 w-4 rounded' />
            <Skeleton className='h-4 flex-1' />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TradeEditSkeleton() {
  return (
    <div className='mx-auto max-w-4xl space-y-6 px-6 py-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <Skeleton className='h-7 w-32' />
        <Skeleton className='h-9 w-20 rounded-lg' />
      </div>

      {/* Trade header card */}
      <div className='space-y-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
        <Skeleton className='h-6 w-56' />
        <div className='flex gap-2'>
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='h-5 w-20 rounded-full' />
        </div>
        <Skeleton className='h-4 w-40' />
        <div className='mt-2 rounded-lg border border-[var(--border-default)] p-3'>
          <div className='grid grid-cols-3 gap-4'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className='space-y-1'>
                <Skeleton className='h-3 w-16' />
                <Skeleton className='h-4 w-28' />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form fields */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
          <Skeleton className='h-5 w-36' />
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className='space-y-1'>
                <Skeleton className='h-3 w-24' />
                <Skeleton className='h-9 w-full rounded-lg' />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TradeReviewSkeleton() {
  return (
    <div className='mx-auto max-w-4xl space-y-6 px-6 py-6'>
      {/* Header */}
      <div className='flex items-start justify-between gap-4'>
        <div className='space-y-2'>
          <Skeleton className='h-7 w-36' />
          <Skeleton className='h-4 w-64' />
        </div>
        <Skeleton className='h-9 w-16 rounded-lg' />
      </div>

      {/* Score preview card */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3'>
        <Skeleton className='h-5 w-40' />
        <Skeleton className='h-14 w-24' />
        <div className='h-2 w-full rounded-full bg-[var(--border-default)]' />
      </div>

      {/* Checklist */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3'>
        <Skeleton className='h-5 w-32' />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className='flex items-center gap-3'>
            <Skeleton className='h-5 w-5 rounded' />
            <Skeleton className='h-4 flex-1' />
          </div>
        ))}
      </div>

      {/* Review notes */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3'>
        <Skeleton className='h-5 w-28' />
        <Skeleton className='h-24 w-full rounded-lg' />
        <div className='grid grid-cols-2 gap-3'>
          <div className='space-y-1'>
            <Skeleton className='h-3 w-20' />
            <Skeleton className='h-9 w-full rounded-lg' />
          </div>
          <div className='space-y-1'>
            <Skeleton className='h-3 w-24' />
            <Skeleton className='h-9 w-full rounded-lg' />
          </div>
        </div>
      </div>
    </div>
  );
}

export function MonthlyReportSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Equity chart */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
        <Skeleton className='mb-3 h-4 w-40' />
        <Skeleton className='h-40 w-full' />
      </div>

      {/* Stat cards */}
      <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Table */}
      <div className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
        <Skeleton className='mx-auto mb-4 h-5 w-32' />
        <div className='divide-y divide-[var(--border-default)]'>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
