'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

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

  after_trade_screenshot_url: string | null; // storage path
};

//Convert ISO datetime to <input type="datetime-local" /> format./
function toLocalDatetimeValue(dateIso: string | null) {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// Parse a numeric text input. Returns null for empty/invalid. 
function safeNum(v: string): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Format a number as USD for the UI. 
function money(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * Normalize unknown errors into a readable message for the UI.
 * Supabase errors usually include { message, code, details, hint }.
 **/
function formatErr(err: unknown) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || 'Unknown error';

  if (typeof err === 'object') {
    const e = err as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    const msg = typeof e.message === 'string' ? e.message : '';
    const code =
      typeof e.code === 'string' || typeof e.code === 'number'
        ? ` (code: ${String(e.code)})`
        : '';
    const details = typeof e.details === 'string' ? ` | ${e.details}` : '';
    const hint = typeof e.hint === 'string' ? ` | ${e.hint}` : '';

    if (msg) return `${msg}${code}${details}${hint}`;

    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  return String(err);
}

// Create a short-lived signed URL for a storage path. Returns '' if it fails. 
async function signPath(path: string, seconds = 60 * 10) {
  const { data, error } = await supabase.storage
    .from('trade-screenshots')
    .createSignedUrl(path, seconds);

  if (error || !data?.signedUrl) return '';
  return data.signedUrl;
}

/**
 * Review page: update execution + reflection fields, checklist adherence,
 * and after-trade screenshot, then mark the trade as reviewed.
 **/
export default function TradeReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tradeId = params.id;

  // Optional safe fallback route (only allow internal paths).
  const returnToParam = searchParams.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') ? returnToParam : null;

  const backHref = returnTo ?? `/trades/${tradeId}`;

  /**
   * Behaves like a real Back button:
   * - If the user navigated here from another page, go back in browser history.
   * - If the page was opened directly (new tab / refresh), fall back to a safe internal route.
   **/
  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }

  const [trade, setTrade] = useState<Trade | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({}); // item_id -> checked

  const [templateId, setTemplateId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Editable review fields
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [closedAt, setClosedAt] = useState('');
  const [commission, setCommission] = useState('0');

  const [emotionTag, setEmotionTag] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  // AFTER screenshot: file upload + previews
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string>('');
  const afterPreviewUrlRef = useRef<string>('');

  // Auto-preview current screenshot (signed url)
  const [afterSignedUrl, setAfterSignedUrl] = useState<string>('');

  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);

  const adherence = useMemo(() => {
    const total = activeItems.length;
    if (!total) return { total: 0, checked: 0, pct: 0 };
    const checkedCount = activeItems.filter((i) => checks[i.id]).length;
    return { total, checked: checkedCount, pct: (checkedCount / total) * 100 };
  }, [activeItems, checks]);

  const grossPnl = Number(trade?.pnl_amount ?? 0);
  const commissionNum = safeNum(commission) ?? 0;
  const netPnl = grossPnl - commissionNum;

  function toggleCheck(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  function onTemplateChange(e: ChangeEvent<HTMLSelectElement>) {
    setTemplateId(e.target.value);
  }

  function onAfterFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

    // Revoke previous preview URL before creating a new one.
    if (afterPreviewUrlRef.current) {
      URL.revokeObjectURL(afterPreviewUrlRef.current);
      afterPreviewUrlRef.current = '';
    }

    setAfterFile(file);

    if (!file) {
      setAfterPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(file);
    afterPreviewUrlRef.current = url;
    setAfterPreviewUrl(url);
  }

  // Revoke any preview URL when the page unmounts.
  useEffect(() => {
    return () => {
      if (afterPreviewUrlRef.current) {
        URL.revokeObjectURL(afterPreviewUrlRef.current);
        afterPreviewUrlRef.current = '';
      }
    };
  }, []);

  // ===== Loaders =====

  const loadTrade = useCallback(async () => {
    setMsg('Loading...');

    const { data, error } = await supabase
      .from('trades')
      .select(
        `id, instrument, direction, outcome, opened_at, pnl_amount, pnl_percent, r_multiple,
         template_id, reviewed_at,
         entry_price, stop_loss, take_profit, exit_price, closed_at, commission, net_pnl,
         emotion_tag, lesson_learned, review_notes,
         after_trade_screenshot_url`
      )
      .eq('id', tradeId)
      .single();

    if (error) {
      console.error(error);
      setMsg(formatErr(error));
      return;
    }

    const t = data as unknown as Trade;
    setTrade(t);

    // Hydrate UI fields
    setEntryPrice(t.entry_price?.toString() ?? '');
    setStopLoss(t.stop_loss?.toString() ?? '');
    setTakeProfit(t.take_profit?.toString() ?? '');
    setExitPrice(t.exit_price?.toString() ?? '');
    setClosedAt(toLocalDatetimeValue(t.closed_at));
    setCommission((t.commission ?? 0).toString());

    setEmotionTag(t.emotion_tag ?? '');
    setLessonLearned(t.lesson_learned ?? '');
    setReviewNotes(t.review_notes ?? '');

    // Prefer the trade’s saved template if present.
    if (t.template_id) setTemplateId(t.template_id);

    setMsg('');
  }, [tradeId]);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('setup_templates')
      .select('id, name, is_default')
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMsg(formatErr(error));
      return;
    }

    const list = (data || []) as Template[];
    setTemplates(list);

    // Only auto-pick if nothing is selected yet.
    setTemplateId((current) => {
      if (current) return current;
      const def = list.find((t) => t.is_default);
      return def?.id || list[0]?.id || '';
    });
  }, []);

  const loadItems = useCallback(async (tplId: string) => {
    const { data, error } = await supabase
      .from('setup_template_items')
      .select('id, label, sort_order, is_active')
      .eq('template_id', tplId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      setMsg(formatErr(error));
      return;
    }

    setItems((data || []) as Item[]);
  }, []);

  const loadChecks = useCallback(async (trId: string, tplId: string) => {
    const { data: itemRows, error: itemErr } = await supabase
      .from('setup_template_items')
      .select('id')
      .eq('template_id', tplId);

    if (itemErr) {
      console.error(itemErr);
      setMsg(formatErr(itemErr));
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
      setMsg(formatErr(error));
      return;
    }

    // Default all criteria to true for review, then override with saved DB values.
    const map: Record<string, boolean> = {};
    for (const id of itemIds) map[id] = true;

    for (const row of (data || []) as CheckRow[]) {
      map[row.item_id] = !!row.checked;
    }

    setChecks(map);
  }, []);

  // Initial load: ensure session, then fetch trade + templates.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/auth');
        return;
      }
      if (cancelled) return;

      await loadTrade();
      await loadTemplates();
    })();

    return () => {
      cancelled = true;
    };
  }, [router, loadTrade, loadTemplates]);

  // When template changes, refresh items + checks.
  useEffect(() => {
    if (!templateId) return;

    let cancelled = false;

    (async () => {
      await loadItems(templateId);
      if (cancelled) return;
      await loadChecks(tradeId, templateId);
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, tradeId, loadItems, loadChecks]);

  // Auto sign and preview existing screenshot whenever trade changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAfterSignedUrl('');
      if (!trade?.after_trade_screenshot_url) return;
      const url = await signPath(trade.after_trade_screenshot_url, 60 * 10);
      if (!cancelled) setAfterSignedUrl(url);
    })();

    return () => {
      cancelled = true;
    };
  }, [trade?.after_trade_screenshot_url]);

  // Upload new AFTER screenshot (if selected) and return storage path for DB. 
  async function uploadAfterScreenshotIfAny(userId: string) {
    if (!afterFile) return trade?.after_trade_screenshot_url ?? null;

    const ext = afterFile.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${userId}/${tradeId}/after-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('trade-screenshots')
      .upload(path, afterFile, { upsert: true });

    if (upErr) throw upErr;

    return path;
  }

  // Open the current AFTER screenshot in a new tab (uses signed URL). 
  async function openAfterScreenshot() {
    if (afterSignedUrl) {
      window.open(afterSignedUrl, '_blank');
      return;
    }

    if (!trade?.after_trade_screenshot_url) return;

    const url = await signPath(trade.after_trade_screenshot_url, 60);
    if (!url) {
      alert('Could not open screenshot');
      return;
    }
    window.open(url, '_blank');
  }

  // Save review fields + checklist checks, mark as reviewed, then return to the previous page.
  async function saveAndMarkReviewed() {
    if (!trade) return;

    setSaving(true);
    setMsg('Saving...');

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setSaving(false);
      router.push('/auth');
      return;
    }

    try {
      const tplId = templateId || null;
      const pnl = Number(trade.pnl_amount) || 0;
      const commissionNum2 = safeNum(commission) ?? 0;
      const netPnl2 = pnl - commissionNum2;

      const afterPath = await uploadAfterScreenshotIfAny(userId);

      const updates: Record<string, unknown> = {
        template_id: tplId,
        entry_price: safeNum(entryPrice),
        stop_loss: safeNum(stopLoss),
        take_profit: safeNum(takeProfit),
        exit_price: safeNum(exitPrice),
        closed_at: closedAt ? new Date(closedAt).toISOString() : null,
        commission: commissionNum2,
        net_pnl: netPnl2,
        emotion_tag: emotionTag.trim() || null,
        lesson_learned: lessonLearned.trim() || null,
        review_notes: reviewNotes.trim() || null,
        after_trade_screenshot_url: afterPath,
        reviewed_at: new Date().toISOString(),
      };

      const { error: e1 } = await supabase
        .from('trades')
        .update(updates)
        .eq('id', trade.id);

      if (e1) throw e1;

      const rows = activeItems.map((it) => ({
        trade_id: trade.id,
        item_id: it.id,
        checked: !!checks[it.id],
      }));

      if (rows.length) {
        const { error: e2 } = await supabase
          .from('trade_criteria_checks')
          .upsert(rows, { onConflict: 'trade_id,item_id' });

        if (e2) throw e2;
      }

      setMsg('Reviewed successfully. Returning...');
      goBack();
    } catch (err: unknown) {
      console.error('saveAndMarkReviewed error:', err);
      setMsg(`Failed to save: ${formatErr(err)}`);
      setSaving(false);
    }
  }

  if (!trade) {
    return <main className='p-6'>{msg || 'Loading...'}</main>;
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
          <button className='border rounded-lg px-4 py-2' onClick={goBack}>
            Back
          </button>
        </div>
      </header>

      {/* Setup checklist */}
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
              onChange={onTemplateChange}>
              {!templates.length && <option value=''>No templates yet</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div className='flex items-end'>
            <button
              className='border rounded-lg px-4 py-2'
              onClick={() => router.push('/settings/setups')}>
              Manage Setups
            </button>
          </div>
        </div>

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

        {activeItems.length > 0 && (
          <div className='text-sm opacity-80'>
            Missed criteria:{' '}
            <span className='font-semibold'>
              {activeItems.filter((i) => !checks[i.id]).length}
            </span>
          </div>
        )}
      </section>

      {/* Execution */}
      <section className='border rounded-xl p-4 space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='font-semibold'>Execution</h2>
          <div className='text-sm opacity-80'>
            Gross P/L: <span className='font-semibold'>{money(grossPnl)}</span>{' '}
            • Net P/L: <span className='font-semibold'>{money(netPnl)}</span>
          </div>
        </div>

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

      {/* After-trade screenshot */}
      <section className='border rounded-xl p-4 space-y-3'>
        <h2 className='font-semibold'>After-Trade Screenshot</h2>

        {afterSignedUrl ? (
          <div className='space-y-2'>
            <div className='flex items-center gap-2 flex-wrap'>
              <button
                className='border rounded-lg px-4 py-2'
                onClick={openAfterScreenshot}>
                View current
              </button>
              <div className='text-sm opacity-70'>
                Upload a new one to replace it.
              </div>
            </div>

            <Image
              src={afterSignedUrl}
              alt='Current after-trade screenshot'
              width={1200}
              height={700}
              unoptimized
              className='max-h-64 w-auto rounded-lg border cursor-pointer'
              onClick={openAfterScreenshot}
              title='Click to view full screen'
            />
          </div>
        ) : trade.after_trade_screenshot_url ? (
          <div className='text-sm opacity-70'>
            Screenshot exists, but preview could not be loaded.
          </div>
        ) : (
          <div className='text-sm opacity-70'>No screenshot uploaded yet.</div>
        )}

        <input type='file' accept='image/*' onChange={onAfterFileChange} />

        {afterPreviewUrl && (
          <div className='space-y-2'>
            <div className='text-sm opacity-70'>
              New screenshot preview (will replace on save)
            </div>
            <Image
              src={afterPreviewUrl}
              alt='After screenshot preview'
              width={1200}
              height={700}
              unoptimized
              className='max-h-64 w-auto rounded-lg border'
            />
          </div>
        )}
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

      <section className='flex flex-wrap gap-2 items-center'>
        <button
          className='border rounded-lg px-4 py-2 disabled:opacity-60'
          disabled={saving}
          onClick={saveAndMarkReviewed}>
          Mark Reviewed
        </button>

        {trade.reviewed_at && (
          <div className='text-sm opacity-80'>
            Previously reviewed on{' '}
            {new Date(trade.reviewed_at).toLocaleString()}
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