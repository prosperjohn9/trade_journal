'use client';

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

export function DashboardTradeTable({ state: s }: { state: PropsState }) {
  const router = useRouter();

  return (
    <div className='overflow-auto'>
      <table className='w-full text-sm'>
        <thead>
          <tr className='text-left border-b'>
            <th className='p-2'>Date</th>
            <th className='p-2'>Instrument</th>
            <th className='p-2'>Dir</th>
            <th className='p-2'>Outcome</th>
            <th className='p-2'>P&amp;L ($)</th>
            <th className='p-2'>P&amp;L (%)</th>
            <th className='p-2'>R</th>
            <th className='p-2'>Checklist</th>
            <th className='p-2'>Reviewed</th>
            <th className='p-2'>Actions</th>
          </tr>
        </thead>

        <tbody>
          {s.trades.map((t: TradeRow) => {
            const pnlAmt = s.calcDisplayPnl(t);

            const pnlPct =
              s.monthStartingBalance && s.monthStartingBalance !== 0
                ? (pnlAmt / s.monthStartingBalance) * 100
                : 0;

            const score = s.checklistScoreByTrade[t.id] ?? null;

            return (
              <tr key={t.id} className='border-b'>
                <td className='p-2'>
                  {new Date(t.opened_at).toLocaleString()}
                </td>
                <td className='p-2'>{t.instrument}</td>
                <td className='p-2'>{t.direction}</td>

                <td className='p-2'>
                  <span
                    className={cx(
                      'inline-flex items-center px-2 py-1 rounded-full border text-xs font-semibold',
                      badgeClasses(t.outcome),
                    )}>
                    {t.outcome}
                  </span>
                </td>

                <td className={cx('p-2 font-medium', signColor(pnlAmt))}>
                  {formatMoney(pnlAmt, s.currency)}
                </td>

                <td className={cx('p-2 font-medium', signColor(pnlPct))}>
                  {formatPercent(pnlPct, 2)}
                </td>

                <td className='p-2'>
                  {t.r_multiple === null || t.r_multiple === undefined
                    ? '—'
                    : formatNumber(Number(t.r_multiple), 2)}
                </td>

                <td className='p-2'>
                  {score === null ? '—' : `${score.toFixed(0)}%`}
                </td>

                <td className='p-2'>{reviewedBadge(t.reviewed_at)}</td>

                <td className='p-2'>
                  <div className='flex flex-wrap gap-2'>
                    <button
                      className='border rounded-lg px-3 py-1'
                      onClick={() => router.push(`/trades/${t.id}`)}>
                      View
                    </button>

                    <button
                      className='border rounded-lg px-3 py-1'
                      onClick={() => router.push(`/trades/${t.id}/edit`)}>
                      Edit
                    </button>

                    <button
                      className='border rounded-lg px-3 py-1'
                      onClick={() => router.push(`/trades/${t.id}/review`)}>
                      Review
                    </button>

                    <button
                      className='border rounded-lg px-3 py-1'
                      onClick={() => s.requestDeleteTrade(t)}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {!s.trades.length && (
            <tr>
              <td className='p-2 opacity-70' colSpan={10}>
                No trades for this month.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}