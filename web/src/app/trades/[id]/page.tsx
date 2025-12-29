'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';

type Trade = {
  id: string;
  opened_at: string;

  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';

  pnl_amount: number;
  pnl_percent: number;
  risk_amount: number | null;
  r_multiple: number | null;

  template_id: string | null;
  notes: string | null;

  reviewed_at: string | null;

  // review fields
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  exit_price: number | null;
  closed_at: string | null;
  commission: number | null;
  net_pnl: number | null;

  emotion_tag: string | null;
  lesson_learned: string | null;
  review_notes: string | null;

  // screenshots
  before_screenshot_path: string | null; // storage path
  after_trade_screenshot_url: string | null; // storage path
};

type ChecklistItem = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

type CheckRow = {
  trade_id: string;
  item_id: string;
  checked: boolean;
};

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtNum(n: number | null, digits = 5) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(digits);
}

function fmtMoney(n: number | null) {
  if (n === null || n === undefined) return '—';
  return money(Number(n));
}

async function signPath(path: string) {
  const { data, error } = await supabase.storage
    .from('trade-screenshots')
    .createSignedUrl(path, 60 * 10); // 10 minutes
  if (error || !data?.signedUrl) return '';
  return data.signedUrl;
}

export default function ViewTradePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [msg, setMsg] = useState('Loading...');

  // always-on previews (signed urls)
  const [beforeUrl, setBeforeUrl] = useState<string>('');
  const [afterUrl, setAfterUrl] = useState<string>('');

  // checklist
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({}); // item_id -> checked

  const grossPnl = useMemo(
    () => (trade ? Number(trade.pnl_amount || 0) : 0),
    [trade]
  );
  const commission = useMemo(
    () => (trade ? Number(trade.commission || 0) : 0),
    [trade]
  );
  const netPnl = useMemo(() => {
    if (!trade) return 0;
    return trade.net_pnl !== null && trade.net_pnl !== undefined
      ? Number(trade.net_pnl)
      : grossPnl - commission;
  }, [trade, grossPnl, commission]);

  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);

  const adherence = useMemo(() => {
    const total = activeItems.length;
    if (!total) return { total: 0, checked: 0, missed: 0, pct: 0 };
    const checkedCount = activeItems.filter((i) => checks[i.id]).length;
    const missed = total - checkedCount;
    return {
      total,
      checked: checkedCount,
      missed,
      pct: (checkedCount / total) * 100,
    };
  }, [activeItems, checks]);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push('/auth');

      const { data, error } = await supabase
        .from('trades')
        .select(
          `id, opened_at, instrument, direction, outcome,
           pnl_amount, pnl_percent, risk_amount, r_multiple,
           template_id, notes, reviewed_at,
           entry_price, stop_loss, take_profit, exit_price, closed_at, commission, net_pnl,
           emotion_tag, lesson_learned, review_notes,
           before_screenshot_path, after_trade_screenshot_url`
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        setMsg(error?.message ?? 'Trade not found');
        return;
      }

      setTrade(data as Trade);
      setMsg('');
    })();
  }, [id, router]);

  // Always show screenshot previews (auto sign on load / when paths change)
  useEffect(() => {
    (async () => {
      if (!trade) return;

      setBeforeUrl('');
      setAfterUrl('');

      if (trade.before_screenshot_path) {
        const url = await signPath(trade.before_screenshot_path);
        setBeforeUrl(url);
      }
      if (trade.after_trade_screenshot_url) {
        const url = await signPath(trade.after_trade_screenshot_url);
        setAfterUrl(url);
      }
    })();
  }, [trade?.before_screenshot_path, trade?.after_trade_screenshot_url, trade]);

  // Load checklist items + checks so you can see rule breaks at a glance
  useEffect(() => {
    (async () => {
      if (!trade?.template_id) {
        setItems([]);
        setChecks({});
        return;
      }

      // 1) load template items
      const { data: itemRows, error: itemErr } = await supabase
        .from('setup_template_items')
        .select('id, label, sort_order, is_active')
        .eq('template_id', trade.template_id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (itemErr) {
        console.error(itemErr);
        return;
      }

      const list = (itemRows || []) as ChecklistItem[];
      setItems(list);

      const itemIds = list.map((i) => i.id);
      if (!itemIds.length) {
        setChecks({});
        return;
      }

      // 2) load saved checks for this trade
      const { data: checkRows, error: checkErr } = await supabase
        .from('trade_criteria_checks')
        .select('trade_id, item_id, checked')
        .eq('trade_id', trade.id)
        .in('item_id', itemIds);

      if (checkErr) {
        console.error(checkErr);
        return;
      }

      // Default false (missed) unless explicitly checked=true
      const map: Record<string, boolean> = {};
      for (const it of list) map[it.id] = false;

      for (const row of (checkRows || []) as CheckRow[]) {
        map[row.item_id] = !!row.checked;
      }

      setChecks(map);
    })();
  }, [trade?.id, trade?.template_id]);

  function openFull(url: string) {
    if (!url) return;
    window.open(url, '_blank');
  }

  if (!trade) {
    return (
      <main className='p-6'>
        <p className='opacity-80'>{msg}</p>
        <button
          className='border rounded-lg px-4 py-2 mt-4'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </main>
    );
  }

  const isReviewed = !!trade.reviewed_at;

  return (
    <main className='p-6 max-w-4xl space-y-6'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Trade Details</h1>
          <div className='text-sm opacity-80'>
            {trade.instrument} • {trade.direction} • {trade.outcome} •{' '}
            {new Date(trade.opened_at).toLocaleString()}
          </div>
          {isReviewed && (
            <div className='text-sm opacity-80'>
              Reviewed on{' '}
              {new Date(trade.reviewed_at as string).toLocaleString()}
            </div>
          )}
        </div>

        <div className='flex gap-2 flex-wrap'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push(`/trades/${trade.id}/edit`)}>
            Edit Entry
          </button>

          {!isReviewed ? (
            <button
              className='border rounded-lg px-4 py-2'
              onClick={() => router.push(`/trades/${trade.id}/review`)}>
              Review Trade
            </button>
          ) : (
            <button
              className='border rounded-lg px-4 py-2'
              onClick={() => router.push(`/trades/${trade.id}/review/edit`)}>
              Edit Review
            </button>
          )}

          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </header>

      {/* ENTRY SUMMARY */}
      <section className='border rounded-xl p-4 space-y-3'>
        <h2 className='font-semibold'>Entry</h2>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Row label='P&L ($)' value={Number(trade.pnl_amount).toFixed(2)} />
          <Row
            label='P&L (%)'
            value={`${Number(trade.pnl_percent).toFixed(2)}%`}
          />
          <Row
            label='Risk ($)'
            value={
              trade.risk_amount === null
                ? '—'
                : Number(trade.risk_amount).toFixed(2)
            }
          />
          <Row
            label='R Multiple'
            value={
              trade.r_multiple === null
                ? '—'
                : Number(trade.r_multiple).toFixed(2)
            }
          />
        </div>

        {trade.notes && <Row label='Notes' value={trade.notes} />}

        {/* Setup checklist */}
        <div className='pt-3 border-t space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>Setup Checklist</div>
            {activeItems.length ? (
              <div className='text-sm opacity-80'>
                Adherence:{' '}
                <span className='font-semibold'>{adherence.checked}</span>/
                {adherence.total} ({adherence.pct.toFixed(0)}%) • Missed:{' '}
                <span className='font-semibold'>{adherence.missed}</span>
              </div>
            ) : (
              <div className='text-sm opacity-70'>No checklist items.</div>
            )}
          </div>

          {activeItems.length > 0 && (
            <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
              {activeItems.map((it) => {
                const ok = !!checks[it.id];
                return (
                  <div
                    key={it.id}
                    className={`flex items-center gap-3 border rounded-lg p-3 ${
                      ok ? '' : 'border-red-300'
                    }`}>
                    <div
                      className={`h-5 w-5 rounded-full border flex items-center justify-center text-xs ${
                        ok ? 'opacity-80' : 'opacity-100'
                      }`}>
                      {ok ? '✓' : '✕'}
                    </div>
                    <div className='text-sm'>
                      <span className={ok ? '' : 'font-semibold'}>
                        {it.label}
                      </span>
                      {!ok && (
                        <span className='ml-2 text-xs opacity-70'>
                          (missed)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Before screenshot (AUTO PREVIEW) */}
        <div className='pt-3 border-t space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>Before-Trade Screenshot</div>
            {beforeUrl ? (
              <button
                className='border rounded-lg px-3 py-2'
                onClick={() => openFull(beforeUrl)}>
                View
              </button>
            ) : (
              <div className='text-sm opacity-70'>None</div>
            )}
          </div>

          {beforeUrl && (
            <img
              src={beforeUrl}
              alt='Before trade screenshot'
              className='max-h-72 rounded-lg border cursor-pointer'
              onClick={() => openFull(beforeUrl)}
              title='Click to view full screen'
            />
          )}
        </div>
      </section>

      {/* REVIEW */}
      <section className='border rounded-xl p-4 space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Review</h2>
          <div className='text-sm opacity-80'>
            Gross P/L: <span className='font-semibold'>{money(grossPnl)}</span>{' '}
            • Net P/L: <span className='font-semibold'>{money(netPnl)}</span>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Row label='Entry Price' value={fmtNum(trade.entry_price)} />
          <Row label='Stop Loss' value={fmtNum(trade.stop_loss)} />
          <Row label='Take Profit' value={fmtNum(trade.take_profit)} />
          <Row label='Exit Price' value={fmtNum(trade.exit_price)} />
          <Row
            label='Exit Date/Time'
            value={
              trade.closed_at ? new Date(trade.closed_at).toLocaleString() : '—'
            }
          />
          <Row label='Commission' value={fmtMoney(trade.commission ?? 0)} />
        </div>

        {/* After screenshot (AUTO PREVIEW) */}
        <div className='pt-3 border-t space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <div className='font-semibold'>After-Trade Screenshot</div>
            {afterUrl ? (
              <button
                className='border rounded-lg px-3 py-2'
                onClick={() => openFull(afterUrl)}>
                View
              </button>
            ) : (
              <div className='text-sm opacity-70'>None</div>
            )}
          </div>

          {afterUrl && (
            <img
              src={afterUrl}
              alt='After trade screenshot'
              className='max-h-72 rounded-lg border cursor-pointer'
              onClick={() => openFull(afterUrl)}
              title='Click to view full screen'
            />
          )}
        </div>

        {/* Reflection */}
        <div className='pt-3 border-t'>
          <h3 className='font-semibold'>Reflection</h3>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mt-2'>
            <Row label='Emotion Tag' value={trade.emotion_tag ?? '—'} />
            <Row label='Lesson Learned' value={trade.lesson_learned ?? '—'} />
          </div>
          {trade.review_notes && (
            <Row label='Extra Notes' value={trade.review_notes} />
          )}
        </div>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className='grid grid-cols-3 gap-3'>
      <div className='text-sm opacity-70'>{label}</div>
      <div className='col-span-2 font-medium break-words'>{value}</div>
    </div>
  );
}