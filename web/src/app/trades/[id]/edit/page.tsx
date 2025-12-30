'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';

type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
type Direction = 'BUY' | 'SELL';

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

function toDatetimeLocalValue(dateIso: string) {
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
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

async function signPath(path: string) {
  const { data, error } = await supabase.storage
    .from('trade-screenshots')
    .createSignedUrl(path, 60 * 10); // 10 mins

  if (error || !data?.signedUrl) return '';
  return data.signedUrl;
}

export default function EditTradePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // ========= ENTRY FIELDS =========
  const [openedAt, setOpenedAt] = useState<string>('');
  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  const [pnlAmount, setPnlAmount] = useState<string>('0');
  const [pnlPercent, setPnlPercent] = useState<string>('0');
  const [riskAmount, setRiskAmount] = useState<number>(1000);
  const [notes, setNotes] = useState('');

  // ========= SETUP/CHECKLIST =========
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // ========= BEFORE SCREENSHOT =========
  const [beforePath, setBeforePath] = useState<string | null>(null);
  const [beforeSignedUrl, setBeforeSignedUrl] = useState<string>('');
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string>('');

  // ========= REVIEW FIELDS (EDITABLE ON THIS PAGE) =========
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);

  const [entryPrice, setEntryPrice] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [exitPrice, setExitPrice] = useState<string>('');
  const [closedAtLocal, setClosedAtLocal] = useState<string>(''); // datetime-local

  const [commission, setCommission] = useState<string>('0');
  const [netPnl, setNetPnl] = useState<string>(''); // optional; auto if blank

  const [emotionTag, setEmotionTag] = useState<string>('');
  const [lessonLearned, setLessonLearned] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');

  // AFTER screenshot (stored as path in DB field `after_trade_screenshot_url`)
  const [afterPath, setAfterPath] = useState<string | null>(null);
  const [afterSignedUrl, setAfterSignedUrl] = useState<string>('');
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string>('');

  // ====== computed ======
  const rMultiple = useMemo(() => {
    const amountNum = Number(pnlAmount);
    if (!riskAmount || Number.isNaN(riskAmount) || Number.isNaN(amountNum))
      return null;
    return amountNum / riskAmount;
  }, [pnlAmount, riskAmount]);

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

  const grossPnlNumber = useMemo(() => Number(pnlAmount || 0), [pnlAmount]);

  const commissionNumber = useMemo(() => {
    const n = Number(commission || 0);
    return Number.isFinite(n) ? n : 0;
  }, [commission]);

  const netPnlComputed = useMemo(
    () => grossPnlNumber - commissionNumber,
    [grossPnlNumber, commissionNumber]
  );

  function toggleCheck(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  // Shared "go back" helper (same behavior for Cancel + Save Review)
  function goBackSafe() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/trades/${id}`);
  }

  // Cancel should return to previous page or trade view
  function onCancel() {
    goBackSafe();
  }

  // ====== local file previews ======
  useEffect(() => {
    if (!beforeFile) {
      setBeforePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(beforeFile);
    setBeforePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [beforeFile]);

  useEffect(() => {
    if (!afterFile) {
      setAfterPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(afterFile);
    setAfterPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [afterFile]);

  function openFull(url: string) {
    if (!url) return;
    window.open(url, '_blank');
  }

  // ====== load trade ======
  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return router.push('/auth');

      const { data, error } = await supabase
        .from('trades')
        .select(
          `id, opened_at, instrument, direction, outcome, pnl_amount, pnl_percent, risk_amount, notes,
           template_id,
           before_screenshot_path,
           reviewed_at,
           entry_price, stop_loss, take_profit, exit_price, closed_at, commission, net_pnl,
           emotion_tag, lesson_learned, review_notes,
           after_trade_screenshot_url`
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        setMsg(error?.message ?? 'Trade not found');
        setLoading(false);
        return;
      }

      // entry
      setOpenedAt(toDatetimeLocalValue(data.opened_at));
      setInstrument(data.instrument);
      setDirection(data.direction);
      setOutcome(data.outcome);
      setPnlAmount(String(data.pnl_amount ?? 0));
      setPnlPercent(String(data.pnl_percent ?? 0));
      setRiskAmount(data.risk_amount ?? 1000);
      setNotes(data.notes ?? '');

      // template/checklist
      setTemplateId(data.template_id ?? null);

      // screenshots
      setBeforePath(data.before_screenshot_path ?? null);
      setAfterPath(data.after_trade_screenshot_url ?? null);

      // review
      setReviewedAt(data.reviewed_at ?? null);
      setEntryPrice(data.entry_price == null ? '' : String(data.entry_price));
      setStopLoss(data.stop_loss == null ? '' : String(data.stop_loss));
      setTakeProfit(data.take_profit == null ? '' : String(data.take_profit));
      setExitPrice(data.exit_price == null ? '' : String(data.exit_price));

      if (data.closed_at) {
        setClosedAtLocal(toDatetimeLocalValue(data.closed_at));
      } else {
        setClosedAtLocal('');
      }

      setCommission(data.commission == null ? '0' : String(data.commission));
      setNetPnl(data.net_pnl == null ? '' : String(data.net_pnl));

      setEmotionTag(data.emotion_tag ?? '');
      setLessonLearned(data.lesson_learned ?? '');
      setReviewNotes(data.review_notes ?? '');

      setLoading(false);
      setMsg('');
    })();
  }, [id, router]);

  // ====== always show current signed URLs (auto preview, no need to click View first) ======
  useEffect(() => {
    (async () => {
      setBeforeSignedUrl('');
      if (!beforePath) return;
      const url = await signPath(beforePath);
      setBeforeSignedUrl(url);
    })();
  }, [beforePath]);

  useEffect(() => {
    (async () => {
      setAfterSignedUrl('');
      if (!afterPath) return;
      const url = await signPath(afterPath);
      setAfterSignedUrl(url);
    })();
  }, [afterPath]);

  // ====== load checklist items + existing checks ======
  useEffect(() => {
    (async () => {
      if (!templateId) {
        setItems([]);
        setChecks({});
        return;
      }

      const { data: itemRows, error: itemErr } = await supabase
        .from('setup_template_items')
        .select('id, label, sort_order, is_active')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (itemErr) {
        console.error(itemErr);
        return;
      }

      const list = (itemRows || []) as ChecklistItem[];
      setItems(list);

      const itemIds = list.map((x) => x.id);
      if (!itemIds.length) {
        setChecks({});
        return;
      }

      const { data: checkRows, error: checkErr } = await supabase
        .from('trade_criteria_checks')
        .select('trade_id, item_id, checked')
        .eq('trade_id', id)
        .in('item_id', itemIds);

      if (checkErr) {
        console.error(checkErr);
        return;
      }

      const map: Record<string, boolean> = {};
      for (const it of list) map[it.id] = false;

      for (const row of (checkRows || []) as CheckRow[]) {
        map[row.item_id] = !!row.checked;
      }

      setChecks(map);
    })();
  }, [templateId, id]);

  // ====== uploads ======
  async function uploadBeforeIfAny(userId: string) {
    if (!beforeFile) return beforePath;

    const ext = beforeFile.name.includes('.')
      ? beforeFile.name.split('.').pop()
      : 'png';
    const path = `before/${userId}/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('trade-screenshots')
      .upload(path, beforeFile, {
        upsert: true,
        cacheControl: '3600',
        contentType: beforeFile.type || undefined,
      });

    if (upErr) throw upErr;

    return path;
  }

  async function uploadAfterIfAny(userId: string) {
    if (!afterFile) return afterPath;

    const ext = afterFile.name.includes('.')
      ? afterFile.name.split('.').pop()
      : 'png';
    const path = `after/${userId}/${id}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('trade-screenshots')
      .upload(path, afterFile, {
        upsert: true,
        cacheControl: '3600',
        contentType: afterFile.type || undefined,
      });

    if (upErr) throw upErr;

    return path;
  }

  async function upsertChecklistRows() {
    if (!templateId || !items.length) return;

    const rows = items.map((it) => ({
      trade_id: id,
      item_id: it.id,
      checked: !!checks[it.id],
    }));

    const { error } = await supabase
      .from('trade_criteria_checks')
      .upsert(rows, { onConflict: 'trade_id,item_id' });

    if (error) throw error;
  }

  // ====== SAVE ENTRY (includes checklist + before screenshot) ======
  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    setMsg('Saving entry...');

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return router.push('/auth');

    const pnlAmountNum = Number(pnlAmount);
    const pnlPercentNum = Number(pnlPercent);

    if (Number.isNaN(pnlAmountNum) || Number.isNaN(pnlPercentNum)) {
      setMsg('Please enter valid P&L values.');
      return;
    }

    // enforce sign based on outcome
    let finalPnlAmount = pnlAmountNum;
    let finalPnlPercent = pnlPercentNum;

    if (outcome === 'LOSS') {
      finalPnlAmount = -Math.abs(pnlAmountNum);
      finalPnlPercent = -Math.abs(pnlPercentNum);
    } else if (outcome === 'WIN') {
      finalPnlAmount = Math.abs(pnlAmountNum);
      finalPnlPercent = Math.abs(pnlPercentNum);
    }

    const finalR =
      riskAmount && !Number.isNaN(riskAmount)
        ? finalPnlAmount / riskAmount
        : null;

    try {
      const newBeforePath = await uploadBeforeIfAny(userId);

      const { error } = await supabase
        .from('trades')
        .update({
          opened_at: new Date(openedAt).toISOString(),
          instrument,
          direction,
          outcome,
          pnl_amount: finalPnlAmount,
          pnl_percent: finalPnlPercent,
          risk_amount: riskAmount || null,
          r_multiple: finalR,
          notes: notes || null,
          before_screenshot_path: newBeforePath ?? null,
        })
        .eq('id', id);

      if (error) {
        setMsg(error.message);
        return;
      }

      await upsertChecklistRows();

      // refresh previews if changed
      if (newBeforePath && newBeforePath !== beforePath)
        setBeforePath(newBeforePath);
      setBeforeFile(null);

      setMsg('Entry saved successfully.');
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message ?? 'Failed to save entry');
    }
  }

  // ====== SAVE REVIEW (marks reviewed_at if needed) ======
  async function saveReview() {
    setMsg('Saving review...');

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return router.push('/auth');

    try {
      const newAfterPath = await uploadAfterIfAny(userId);

      const entryPriceNum = safeNum(entryPrice);
      const stopLossNum = safeNum(stopLoss);
      const takeProfitNum = safeNum(takeProfit);
      const exitPriceNum = safeNum(exitPrice);

      const commissionNum = safeNum(commission) ?? 0;

      const netPnlNum =
        safeNum(netPnl) !== null ? (safeNum(netPnl) as number) : netPnlComputed;

      const closedAtIso = closedAtLocal
        ? new Date(closedAtLocal).toISOString()
        : null;

      const nowIso = new Date().toISOString();
      const reviewedAtIso = reviewedAt ?? nowIso;

      const { error } = await supabase
        .from('trades')
        .update({
          reviewed_at: reviewedAtIso,
          entry_price: entryPriceNum,
          stop_loss: stopLossNum,
          take_profit: takeProfitNum,
          exit_price: exitPriceNum,
          closed_at: closedAtIso,
          commission: commissionNum,
          net_pnl: netPnlNum,
          emotion_tag: emotionTag || null,
          lesson_learned: lessonLearned || null,
          review_notes: reviewNotes || null,
          after_trade_screenshot_url: newAfterPath ?? null,
        })
        .eq('id', id);

      if (error) {
        setMsg(error.message);
        return;
      }

      if (newAfterPath && newAfterPath !== afterPath)
        setAfterPath(newAfterPath);
      setAfterFile(null);

      if (!reviewedAt) setReviewedAt(reviewedAtIso);

      setMsg('Review saved successfully.');

      // ✅ GO BACK (same behavior as Cancel)
      goBackSafe();
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message ?? 'Failed to save review');
    }
  }

  if (loading) {
    return (
      <main className='p-6'>
        <p className='opacity-80'>Loading...</p>
      </main>
    );
  }

  return (
    <main className='p-6 max-w-2xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Edit Trade</h1>
        <button className='border rounded-lg px-4 py-2' onClick={onCancel}>
          Cancel
        </button>
      </header>

      {msg && <p className='text-sm opacity-80'>{msg}</p>}

      {/* ===== ENTRY FORM ===== */}
      <form onSubmit={saveEntry} className='space-y-4 border rounded-xl p-4'>
        <h2 className='font-semibold'>Entry</h2>

        <Field label='Date/Time'>
          <input
            className='w-full border rounded-lg p-3'
            type='datetime-local'
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
            required
          />
        </Field>

        {/* Setup checklist (editable) */}
        <section className='border rounded-xl p-4 space-y-3'>
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
            <div className='grid grid-cols-1 gap-2'>
              {activeItems.map((it) => {
                const ok = !!checks[it.id];
                return (
                  <label
                    key={it.id}
                    className={`flex items-center gap-3 border rounded-lg p-3 ${
                      ok ? '' : 'border-red-300'
                    }`}>
                    <input
                      type='checkbox'
                      checked={ok}
                      onChange={() => toggleCheck(it.id)}
                    />
                    <span className='text-sm'>{it.label}</span>
                    {!ok && (
                      <span className='text-xs opacity-70'>(missed)</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {templateId && (
            <div className='text-xs opacity-60'>
              Manage checklist items in{' '}
              <button
                type='button'
                className='underline'
                onClick={() => router.push('/settings/setups')}>
                Settings → Setups
              </button>
            </div>
          )}
        </section>

        {/* Before screenshot */}
        <section className='border rounded-xl p-4 space-y-2'>
          <div className='font-semibold'>Before-Trade Screenshot</div>
          <div className='text-sm opacity-70'>
            Current screenshot is shown below. Choose a file to replace it
            (optional).
          </div>

          {beforeSignedUrl ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-3'>
                <div className='text-sm opacity-80'>Current screenshot</div>
                <button
                  type='button'
                  className='border rounded-lg px-3 py-2'
                  onClick={() => openFull(beforeSignedUrl)}>
                  View Full
                </button>
              </div>
              <img
                src={beforeSignedUrl}
                alt='Current before screenshot'
                className='max-h-64 rounded-lg border cursor-pointer'
                onClick={() => openFull(beforeSignedUrl)}
                title='Click to view full screen'
              />
            </div>
          ) : (
            <div className='text-sm opacity-70'>No current screenshot.</div>
          )}

          <input
            type='file'
            accept='image/*'
            onChange={(e) => setBeforeFile(e.target.files?.[0] ?? null)}
          />

          {beforePreviewUrl && (
            <div className='space-y-2'>
              <div className='text-sm opacity-80'>
                New screenshot preview (will replace on save)
              </div>
              <img
                src={beforePreviewUrl}
                alt='New before preview'
                className='max-h-64 rounded-lg border'
              />
            </div>
          )}
        </section>

        <Field label='Instrument'>
          <input
            className='w-full border rounded-lg p-3'
            value={instrument}
            onChange={(e) => setInstrument(e.target.value.toUpperCase())}
            required
          />
        </Field>

        <div className='grid grid-cols-2 gap-3'>
          <Field label='Direction'>
            <select
              className='w-full border rounded-lg p-3'
              value={direction}
              onChange={(e) => setDirection(e.target.value as any)}>
              <option value='BUY'>BUY</option>
              <option value='SELL'>SELL</option>
            </select>
          </Field>

          <Field label='Outcome'>
            <select
              className='w-full border rounded-lg p-3'
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as any)}>
              <option value='WIN'>WIN</option>
              <option value='LOSS'>LOSS</option>
              <option value='BREAKEVEN'>BREAKEVEN</option>
            </select>
          </Field>
        </div>

        <div className='grid grid-cols-2 gap-3'>
          <Field label='P&L ($)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={pnlAmount}
              onChange={(e) => setPnlAmount(e.target.value)}
              required
            />
          </Field>

          <Field label='P&L (%)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={pnlPercent}
              onChange={(e) => setPnlPercent(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Risk ($) — for R multiple'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={riskAmount}
              onChange={(e) => setRiskAmount(Number(e.target.value))}
            />
          </Field>

          <div className='border rounded-lg p-3 flex items-center'>
            <div className='text-sm opacity-70'>
              R-Multiple:{' '}
              <span className='font-semibold'>
                {rMultiple === null || Number.isNaN(rMultiple)
                  ? '—'
                  : rMultiple.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <Field label='Notes (optional)'>
          <textarea
            className='w-full border rounded-lg p-3 min-h-28'
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <button className='w-full border rounded-lg p-3'>Save Entry</button>
      </form>

      {/* ===== REVIEW SECTION (BOTTOM, SAME PAGE) ===== */}
      <section className='border rounded-xl p-4 space-y-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='space-y-1'>
            <h2 className='font-semibold'>Review</h2>
            {reviewedAt ? (
              <div className='text-sm opacity-80'>
                Reviewed on {new Date(reviewedAt).toLocaleString()}
              </div>
            ) : (
              <div className='text-sm opacity-70'>Not reviewed yet.</div>
            )}
          </div>

          <div className='text-sm opacity-80 text-right'>
            Gross P/L:{' '}
            <span className='font-semibold'>{money(grossPnlNumber)}</span>
            <div>
              Net P/L:{' '}
              <span className='font-semibold'>
                {money(safeNum(netPnl) ?? netPnlComputed)}
              </span>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Entry Price'>
            <input
              className='w-full border rounded-lg p-3'
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder='e.g. 1.07452'
            />
          </Field>

          <Field label='Stop Loss'>
            <input
              className='w-full border rounded-lg p-3'
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder='e.g. 1.07210'
            />
          </Field>

          <Field label='Take Profit'>
            <input
              className='w-full border rounded-lg p-3'
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder='e.g. 1.07980'
            />
          </Field>

          <Field label='Exit Price'>
            <input
              className='w-full border rounded-lg p-3'
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder='e.g. 1.07980'
            />
          </Field>

          <Field label='Exit Date/Time'>
            <input
              className='w-full border rounded-lg p-3'
              type='datetime-local'
              value={closedAtLocal}
              onChange={(e) => setClosedAtLocal(e.target.value)}
            />
          </Field>

          <Field label='Commission'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
            />
          </Field>

          <Field label='Net P/L (optional)'>
            <input
              className='w-full border rounded-lg p-3'
              type='number'
              step='0.01'
              value={netPnl}
              onChange={(e) => setNetPnl(e.target.value)}
              placeholder={`Auto: ${netPnlComputed.toFixed(2)}`}
            />
          </Field>
        </div>

        {/* After screenshot */}
        <section className='border rounded-xl p-4 space-y-2'>
          <div className='font-semibold'>After-Trade Screenshot</div>
          <div className='text-sm opacity-70'>
            Current screenshot is shown below. Choose a file to replace it
            (optional).
          </div>

          {afterSignedUrl ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-3'>
                <div className='text-sm opacity-80'>Current screenshot</div>
                <button
                  type='button'
                  className='border rounded-lg px-3 py-2'
                  onClick={() => openFull(afterSignedUrl)}>
                  View Full
                </button>
              </div>
              <img
                src={afterSignedUrl}
                alt='Current after screenshot'
                className='max-h-64 rounded-lg border cursor-pointer'
                onClick={() => openFull(afterSignedUrl)}
                title='Click to view full screen'
              />
            </div>
          ) : (
            <div className='text-sm opacity-70'>No current screenshot.</div>
          )}

          <input
            type='file'
            accept='image/*'
            onChange={(e) => setAfterFile(e.target.files?.[0] ?? null)}
          />

          {afterPreviewUrl && (
            <div className='space-y-2'>
              <div className='text-sm opacity-80'>
                New screenshot preview (will replace on save)
              </div>
              <img
                src={afterPreviewUrl}
                alt='New after preview'
                className='max-h-64 rounded-lg border'
              />
            </div>
          )}
        </section>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
          <Field label='Emotion Tag'>
            <input
              className='w-full border rounded-lg p-3'
              value={emotionTag}
              onChange={(e) => setEmotionTag(e.target.value)}
              placeholder='e.g. Calm, FOMO, Impatient'
            />
          </Field>

          <Field label='Lesson Learned'>
            <input
              className='w-full border rounded-lg p-3'
              value={lessonLearned}
              onChange={(e) => setLessonLearned(e.target.value)}
              placeholder='e.g. Patience'
            />
          </Field>
        </div>

        <Field label='Review Notes (optional)'>
          <textarea
            className='w-full border rounded-lg p-3 min-h-28'
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
          />
        </Field>

        <button
          type='button'
          className='w-full border rounded-lg p-3'
          onClick={saveReview}>
          Save Review
        </button>
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
    <label className='block space-y-1'>
      <div className='text-sm opacity-70'>{label}</div>
      {children}
    </label>
  );
}
