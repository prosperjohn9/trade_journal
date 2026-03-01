'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/src/lib/utils/format';
import { cx } from '@/src/lib/utils/ui';
import {
  badgeClasses,
  reviewedBadge,
  signColor,
  formatNumber,
  formatPercent,
} from '@/src/components/dashboard/dashboard-ui';
import type { DashboardState } from '@/src/hooks/useDashboard';

type PropsState = Pick<
  DashboardState,
  | 'trades'
  | 'currency'
  | 'monthStartingBalance'
  | 'checklistScoreByTrade'
  | 'calcDisplayPnl'
  | 'requestDeleteTrade'
>;

type TradeRow = PropsState['trades'][number];

function executionTone(score: number): string {
  if (score < 40) return 'var(--loss)';
  if (score < 70) return '#f59e0b';
  return 'var(--profit)';
}

function ChecklistCell({ score }: { score: number }) {
  const normalized = Math.max(0, Math.min(100, score));
  const tone = executionTone(normalized);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setBarWidth(normalized);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [normalized]);

  return (
    <div className='inline-flex items-center justify-end gap-2'>
      <div className='h-1 w-20 overflow-hidden rounded-full bg-[var(--bg-subtle)]'>
        <div
          className='h-full rounded-full transition-[width] duration-700 ease-out'
          style={{
            width: `${barWidth}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 80%, transparent), color-mix(in srgb, ${tone} 45%, transparent))`,
          }}
        />
      </div>
      <span
        className='w-10 text-right text-xs font-semibold tabular-nums'
        style={{
          color: `color-mix(in srgb, ${tone} 88%, var(--text-primary))`,
        }}>
        {normalized.toFixed(0)}%
      </span>
    </div>
  );
}

export function DashboardTradeTable({ state: s }: { state: PropsState }) {
  const router = useRouter();
  const [openActionsTradeId, setOpenActionsTradeId] = useState<string | null>(
    null,
  );
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const effectiveOpenActionsTradeId =
    openActionsTradeId && s.trades.some((t) => t.id === openActionsTradeId)
      ? openActionsTradeId
      : null;

  useEffect(() => {
    if (!effectiveOpenActionsTradeId) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (openMenuRef.current && !openMenuRef.current.contains(target)) {
        setOpenActionsTradeId(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenActionsTradeId(null);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [effectiveOpenActionsTradeId]);

  return (
    <div className='max-h-[620px] overflow-auto rounded-xl border border-[var(--border-default)]'>
      <table className='w-full min-w-[1120px] border-collapse text-sm'>
        <thead>
          <tr className='border-b border-[var(--table-divider)] text-xs uppercase tracking-wide text-[var(--text-secondary)]'>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              Date
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              Instrument
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              Dir
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              Outcome
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              P&amp;L ($)
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              P&amp;L (%)
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              R
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              Checklist
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] px-4 py-4 text-center font-semibold'>
              Reviewed
            </th>
            <th className='sticky top-0 z-10 bg-[var(--bg-subtle)] pl-4 pr-8 py-4 text-center font-semibold'>
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {s.trades.map((t: TradeRow, index: number) => {
            const pnlAmt = s.calcDisplayPnl(t);
            const isActionsOpen = effectiveOpenActionsTradeId === t.id;
            const isLastRow = index === s.trades.length - 1;
            const shouldOpenUp = isLastRow;

            const pnlPct =
              s.monthStartingBalance && s.monthStartingBalance !== 0
                ? (pnlAmt / s.monthStartingBalance) * 100
                : 0;

            const score = s.checklistScoreByTrade[t.id] ?? null;

            return (
              <tr
                key={t.id}
                className='border-b border-[var(--table-divider)] bg-[var(--table-row-bg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--table-row-hover)]'>
                <td className='whitespace-nowrap px-4 py-[18px]'>
                  {new Date(t.opened_at).toLocaleString()}
                </td>

                <td className='px-4 py-[18px] font-medium text-[var(--text-primary)]'>
                  {t.instrument}
                </td>

                <td className='px-4 py-[18px]'>{t.direction}</td>

                <td className='px-4 py-[18px]'>
                  <span
                    className={cx(
                      'inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold',
                      badgeClasses(t.outcome),
                    )}>
                    {t.outcome}
                  </span>
                </td>

                <td
                  className={cx(
                    'px-4 py-[18px] text-right font-mono font-medium tabular-nums',
                    signColor(pnlAmt),
                  )}>
                  {formatMoney(pnlAmt, s.currency)}
                </td>

                <td
                  className={cx(
                    'px-4 py-[18px] text-right font-mono font-medium tabular-nums',
                    signColor(pnlPct),
                  )}>
                  {formatPercent(pnlPct, 2)}
                </td>

                <td className='px-4 py-[18px] text-right tabular-nums text-[var(--text-primary)]'>
                  {t.r_multiple === null || t.r_multiple === undefined
                    ? '—'
                    : formatNumber(Number(t.r_multiple), 2)}
                </td>

                <td className='px-4 py-[18px] text-center'>
                  {score === null ? (
                    <span className='text-[var(--text-muted)]'>—</span>
                  ) : (
                    <ChecklistCell score={score} />
                  )}
                </td>

                <td className='px-4 py-[18px] text-center'>
                  {reviewedBadge(t.reviewed_at)}
                </td>

                <td
                  className={cx(
                    'min-w-[220px] pl-4 pr-8 py-[18px] text-center',
                    isActionsOpen && 'relative z-30',
                  )}>
                  <div className='mx-auto flex w-full max-w-[220px] items-center justify-center gap-2'>
                    <button
                      className='rounded-lg border border-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]'
                      onClick={() => {
                        setOpenActionsTradeId(null);
                        router.push(`/trades/${t.id}`);
                      }}>
                      View
                    </button>

                    <button
                      className='rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                      onClick={() => {
                        setOpenActionsTradeId(null);
                        router.push(
                          `/trades/${t.id}/edit?returnTo=${encodeURIComponent(
                            '/dashboard',
                          )}`,
                        );
                      }}>
                      Edit
                    </button>

                    <div
                      className='relative'
                      ref={isActionsOpen ? openMenuRef : undefined}>
                      <button
                        type='button'
                        aria-haspopup='menu'
                        aria-expanded={isActionsOpen}
                        className='flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-default)] text-lg leading-none text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                        onClick={() =>
                          setOpenActionsTradeId((prev) =>
                            prev === t.id ? null : t.id,
                          )
                        }>
                        ⋯
                      </button>

                      {isActionsOpen && (
                        <div
                          role='menu'
                          className={cx(
                            'absolute right-0 z-40 w-32 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.5)]',
                            shouldOpenUp
                              ? 'bottom-[calc(100%-14px)]'
                              : 'top-10',
                          )}>
                          <button
                            role='menuitem'
                            className='w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                            onClick={() => {
                              setOpenActionsTradeId(null);
                              router.push(`/trades/${t.id}/review`);
                            }}>
                            Review
                          </button>

                          <button
                            role='menuitem'
                            className='mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--loss)]'
                            onClick={() => {
                              setOpenActionsTradeId(null);
                              s.requestDeleteTrade(t);
                            }}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}

          {!s.trades.length && (
            <tr>
              <td
                className='px-4 py-[18px] text-center text-[var(--text-muted)]'
                colSpan={10}>
                No trades for this month.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
