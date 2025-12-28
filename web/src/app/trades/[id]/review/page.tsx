'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter, useParams } from 'next/navigation';

type Template = { id: string; name: string; is_default: boolean };
type Item = {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};
type CheckRow = { trade_id: string; item_id: string; checked: boolean };

type Trade = {
  id: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  opened_at: string;
  pnl_amount: number;
  pnl_percent: number;
  r_multiple: number | null;

  template_id: string | null;
  reviewed_at: string | null;

  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  exit_price: number | null;
  closed_at: string | null;
  commission: number;
  net_pnl: number | null;

  emotion_tag: string | null;
  lesson_learned: string | null;
  review_notes: string | null;
};

function toLocalDatetimeValue(dateIso: string | null) {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function safeNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export default function TradeReviewPage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = String(params.id || '');

  const [trade, setTrade] = useState<Trade | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({}); // item_id -> checked

  const [templateId, setTemplateId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // editable fields
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [closedAt, setClosedAt] = useState(''); // datetime-local
  const [commission, setCommission] = useState('0');
  const [emotionTag, setEmotionTag] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);

  const adherence = useMemo(() => {
    const total = activeItems.length;
    if (!total) return { total: 0, checked: 0, pct: 0 };
    const checked = activeItems.filter((i) => checks[i.id]).length;
    return { total, checked, pct: (checked / total) * 100 };
  }, [activeItems, checks]);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return router.push('/auth');

      await loadTrade();
      await loadTemplates();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  useEffect(() => {
    if (!templateId) return;
    (async () => {
      await loadItems(templateId);
      await loadChecks(tradeId, templateId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  async function loadTrade() {
    const { data, error } = await supabase
      .from('trades')
      .select(
        `id, instrument, direction, outcome, opened_at, pnl_amount, pnl_percent, r_multiple,
         template_id, reviewed_at,
         entry_price, stop_loss, take_profit, exit_price, closed_at, commission, net_pnl,
         emotion_tag, lesson_learned, review_notes`
      )
      .eq('id', tradeId)
      .single();

    if (error) {
      console.error(error);
      setMsg(error.message);
      return;
    }

    const t = data as Trade;
    setTrade(t);

    // hydrate UI fields
    setEntryPrice(t.entry_price?.toString() ?? '');
    setStopLoss(t.stop_loss?.toString() ?? '');
    setTakeProfit(t.take_profit?.toString() ?? '');
    setExitPrice(t.exit_price?.toString() ?? '');
    setClosedAt(toLocalDatetimeValue(t.closed_at));
    setCommission((t.commission ?? 0).toString());
    setEmotionTag(t.emotion_tag ?? '');
    setLessonLearned(t.lesson_learned ?? '');
    setReviewNotes(t.review_notes ?? '');

    // template selection will be set after templates load (default logic)
  }

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('setup_templates')
      .select('id, name, is_default')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMsg(error.message);
      return;
    }

    const list = (data || []) as Template[];
    setTemplates(list);

    // choose template:
    // 1) trade.template_id
    // 2) user default
    // 3) first template
    const currentTradeTemplateId = (trade as any)?.template_id as string | null;
    const def = list.find((t) => t.is_default);
    const pick = currentTradeTemplateId || def?.id || list[0]?.id || '';
    setTemplateId(pick);
  }

  async function loadItems(tplId: string) {
    const { data, error } = await supabase
      .from('setup_template_items')
      .select('id, label, sort_order, is_active')
      .eq('template_id', tplId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMsg(error.message);
      return;
    }

    setItems((data || []) as Item[]);
  }

  async function loadChecks(trId: string, tplId: string) {
    // Load checks only for items of this template.
    const { data: itemRows, error: itemErr } = await supabase
      .from('setup_template_items')
      .select('id')
      .eq('template_id', tplId);

    if (itemErr) {
      console.error(itemErr);
      return;
    }

    const itemIds = (itemRows || []).map((r) => r.id);

    if (!itemIds.length) {
      setChecks({});
      return;
    }

    const { data, error } = await supabase
      .from('trade_criteria_checks')
      .select('trade_id, item_id, checked')
      .eq('trade_id', trId)
      .in('item_id', itemIds);

    if (error) {
      console.error(error);
      setMsg(error.message);
      return;
    }

    const map: Record<string, boolean> = {};
    for (const id of itemIds) map[id] = true; // default: checked
    for (const row of (data || []) as CheckRow[]) {
      map[row.item_id] = !!row.checked;
    }
    setChecks(map);
  }

  function toggleCheck(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function saveReview(markReviewed: boolean) {
    if (!trade) return;

    setSaving(true);
    setMsg('Saving...');

    const tplId = templateId || null;
    const commissionNum = safeNum(commission) ?? 0;
    const pnl = Number(trade.pnl_amount) || 0;

    // optional derived net pnl
    const netPnl = pnl - commissionNum;

    // 1) update trade fields
    const updates: any = {
      template_id: tplId,
      entry_price: safeNum(entryPrice),
      stop_loss: safeNum(stopLoss),
      take_profit: safeNum(takeProfit),
      exit_price: safeNum(exitPrice),
      closed_at: closedAt ? new Date(closedAt).toISOString() : null,
      commission: commissionNum,
      net_pnl: netPnl,
      emotion_tag: emotionTag.trim() || null,
      lesson_learned: lessonLearned.trim() || null,
      review_notes: reviewNotes.trim() || null,
      reviewed_at: markReviewed ? new Date().toISOString() : trade.reviewed_at,
    };

    const { error: e1 } = await supabase
      .from('trades')
      .update(updates)
      .eq('id', trade.id);

    if (e1) {
      setSaving(false);
      setMsg(e1.message);
      return;
    }

    // 2) upsert checks for active items
    const rows = activeItems.map((it) => ({
      trade_id: trade.id,
      item_id: it.id,
      checked: !!checks[it.id],
    }));

    const { error: e2 } = await supabase
      .from('trade_criteria_checks')
      .upsert(rows, { onConflict: 'trade_id,item_id' });

    if (e2) {
      setSaving(false);
      setMsg(e2.message);
      return;
    }

    setMsg(markReviewed ? 'Reviewed' : 'Saved');
    setSaving(false);

    // refresh trade state locally
    setTrade((prev) =>
      prev
        ? {
            ...prev,
            ...updates,
          }
        : prev
    );

    setTimeout(() => setMsg(''), 1500);
  }

  if (!trade) {
    return <main className='p-6'>Loading...</main>;
  }

  return (
    <main className='p-6 space-y-6 max-w-4xl'>
      <header className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-semibold'>Review Trade</h1>
          <div className='text-sm opacity-80'>
            {trade.instrument} • {trade.direction} • {trade.outcome} •{' '}
            {new Date(trade.opened_at).toLocaleString()}
          </div>
          {msg && <div className='text-sm opacity-80'>{msg}</div>}
        </div>

        <div className='flex gap-2'>
          <button
            className='border rounded-lg px-4 py-2'
            onClick={() => router.push('/dashboard')}>
            Back
          </button>
        </div>
      </header>

      {/* Template picker */}
      <section className='border rounded-xl p-4 space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Setup Checklist</h2>
          <div className='text-sm opacity-80'>
            Adherence:{' '}
            <span className='font-semibold'>{adherence.checked}</span>/
            {adherence.total} ({adherence.pct.toFixed(0)}%)
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <label className='space-y-1'>
            <div className='text-sm opacity-70'>Template</div>
            <select
              className='border rounded-lg p-3 w-full'
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}>
              {!templates.length && <option value=''>No templates yet</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>

            {!templates.length && (
              <div className='text-xs opacity-70'>
                You need a setup template first. Create one in{' '}
                <button
                  className='underline'
                  onClick={() => router.push('/settings/setups')}>
                  Settings → Setups
                </button>
                .
              </div>
            )}
          </label>

          <div className='flex items-end'>
            <button
              className='border rounded-lg px-4 py-2'
              onClick={() => router.push('/settings/setups')}>
              Manage Setups
            </button>
          </div>
        </div>

        {/* Checklist */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
          {activeItems.map((it) => (
            <label
              key={it.id}
              className='flex items-center gap-3 border rounded-lg p-3'>
              <input
                type='checkbox'
                checked={!!checks[it.id]}
                onChange={() => toggleCheck(it.id)}
              />
              <span>{it.label}</span>
            </label>
          ))}

          {!!templateId && activeItems.length === 0 && (
            <div className='text-sm opacity-70'>
              No active items in this template yet.
            </div>
          )}
        </div>

        {/* Missed criteria = “mistakes” automatically */}
        {activeItems.length > 0 && (
          <div className='text-sm opacity-80'>
            Missed criteria:{' '}
            <span className='font-semibold'>
              {activeItems.filter((i) => !checks[i.id]).length}
            </span>
          </div>
        )}
      </section>

      {/* Execution fields */}
      <section className='border rounded-xl p-4 space-y-4'>
        <h2 className='font-semibold'>Execution</h2>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Entry Price'>
            <input
              className='border rounded-lg p-3 w-full'
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.10250'
            />
          </Field>

          <Field label='Stop Loss'>
            <input
              className='border rounded-lg p-3 w-full'
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.10000'
            />
          </Field>

          <Field label='Take Profit'>
            <input
              className='border rounded-lg p-3 w-full'
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.11000'
            />
          </Field>

          <Field label='Exit Price'>
            <input
              className='border rounded-lg p-3 w-full'
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 1.10800'
            />
          </Field>

          <Field label='Exit Date/Time'>
            <input
              className='border rounded-lg p-3 w-full'
              type='datetime-local'
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
            />
          </Field>

          <Field label='Commission'>
            <input
              className='border rounded-lg p-3 w-full'
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              inputMode='decimal'
              placeholder='e.g., 6'
            />
          </Field>
        </div>
      </section>

      {/* Reflection */}
      <section className='border rounded-xl p-4 space-y-4'>
        <h2 className='font-semibold'>Reflection</h2>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Emotion Tag'>
            <select
              className='border rounded-lg p-3 w-full'
              value={emotionTag}
              onChange={(e) => setEmotionTag(e.target.value)}>
              <option value=''>—</option>
              <option value='Calm'>Calm</option>
              <option value='Confident'>Confident</option>
              <option value='Anxious'>Anxious</option>
              <option value='FOMO'>FOMO</option>
              <option value='Revenge'>Revenge</option>
              <option value='Overconfident'>Overconfident</option>
            </select>
          </Field>

          <Field label='Lesson Learned'>
            <input
              className='border rounded-lg p-3 w-full'
              value={lessonLearned}
              onChange={(e) => setLessonLearned(e.target.value)}
              placeholder='1 sentence is enough.'
            />
          </Field>
        </div>

        <Field label='Extra Notes (optional)'>
          <textarea
            className='border rounded-lg p-3 w-full min-h-28'
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder='Any context you want to remember.'
          />
        </Field>
      </section>

      {/* Actions */}
      <section className='flex flex-wrap gap-2'>
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          disabled={saving}
          onClick={() => saveReview(false)}>
          Save
        </button>

        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          disabled={saving}
          onClick={() => saveReview(true)}>
          Mark Reviewed
        </button>

        {trade.reviewed_at && (
          <div className='text-sm opacity-80 flex items-center'>
            Reviewed on {new Date(trade.reviewed_at).toLocaleString()}
          </div>
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className='space-y-1 block'>
      <div className='text-sm opacity-70'>{label}</div>
      {children}
    </label>
  );
}