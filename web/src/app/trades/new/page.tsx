'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/src/lib/supabaseClient';
import { useRouter } from 'next/navigation';

/**
 * Returns current local time in the format required by <input type="datetime-local" />.
 * Note: This is local time (no timezone offset in the string).
 **/
function nowLocalDatetimeValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

// Select value types (keeps the <select> handlers type-safe without `any`).
type Direction = 'BUY' | 'SELL';
type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

function toDirection(v: string): Direction {
  return v === 'SELL' ? 'SELL' : 'BUY';
}

function toOutcome(v: string): Outcome {
  if (v === 'LOSS' || v === 'BREAKEVEN') return v;
  return 'WIN';
}

type Template = {
  id: string;
  name: string;
  is_default: boolean;
};

type Item = {
  id: string;
  label: string;
  sort_order: number;
};

export default function NewTradePage() {
  const router = useRouter();

  // Default opened time to "now" (local time string)
  const [openedAt, setOpenedAt] = useState(nowLocalDatetimeValue);

  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  // Keep these as strings so the inputs stay controlled (and typing "-" is possible).
  const [pnlAmount, setPnlAmount] = useState<string>('2000');
  const [pnlPercent, setPnlPercent] = useState<string>('2');

  const [riskAmount, setRiskAmount] = useState<number>(1000);

  // Setup template + checklist captured at entry time.
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({}); // item_id -> checked

  // Optional BEFORE-trade setup screenshot.
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string>('');
  const beforePreviewUrlRef = useRef<string>('');

  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Create a preview URL immediately when a file is chosen.
  function onBeforeFileChange(file: File | null) {
    // Revoke previous preview URL before creating a new one.
    if (beforePreviewUrlRef.current) {
      URL.revokeObjectURL(beforePreviewUrlRef.current);
      beforePreviewUrlRef.current = '';
    }

    setBeforeFile(file);

    if (!file) {
      setBeforePreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(file);
    beforePreviewUrlRef.current = url;
    setBeforePreviewUrl(url);
  }

  // Cleanup preview URL on unmount.
  useEffect(() => {
    return () => {
      if (beforePreviewUrlRef.current) {
        URL.revokeObjectURL(beforePreviewUrlRef.current);
        beforePreviewUrlRef.current = '';
      }
    };
  }, []);

  // Load available setup templates once.
  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/auth');
        return;
      }

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

      // Pick default template if present; otherwise pick the first one.
      const def = list.find((t) => t.is_default);
      const pick = def?.id || list[0]?.id || '';
      setTemplateId((prev) => prev || pick);
    })();
  }, [router]);

  // Load checklist items for the selected template (active only).
  useEffect(() => {
    (async () => {
      if (!templateId) {
        setItems([]);
        setChecks({});
        return;
      }

      const { data, error } = await supabase
        .from('setup_template_items')
        .select('id, label, sort_order')
        .eq('template_id', templateId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.error(error);
        setMsg(error.message);
        return;
      }

      const list = (data || []) as Item[];
      setItems(list);

      // Reset checks for the selected template (default: unchecked).
      const next: Record<string, boolean> = {};
      for (const it of list) next[it.id] = false;
      setChecks(next);
    })();
  }, [templateId]);

  function toggle(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  const checkedCount = useMemo(
    () => Object.values(checks).filter(Boolean).length,
    [checks]
  );

  const totalCount = items.length;

  const checklistScore =
    totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : null;

  const rMultiple = useMemo(() => {
    if (!riskAmount || Number.isNaN(riskAmount)) return null;

    const amountNum = Number(pnlAmount);
    if (Number.isNaN(amountNum)) return null;

    return amountNum / riskAmount;
  }, [pnlAmount, riskAmount]);

  async function uploadBeforeScreenshot(params: {
    userId: string;
    tradeId: string;
    file: File;
  }) {
    const { userId, tradeId, file } = params;

    // Store as: before/<userId>/<tradeId>.<ext>
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `before/${userId}/${tradeId}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('trade-screenshots')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || undefined,
      });

    if (upErr) throw upErr;
    return path;
  }

  async function saveTrade(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setMsg('Saving...');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push('/auth');
        return;
      }

      const pnlAmountNum = Number(pnlAmount);
      const pnlPercentNum = Number(pnlPercent);

      if (Number.isNaN(pnlAmountNum) || Number.isNaN(pnlPercentNum)) {
        setMsg('Please enter valid P&L values.');
        setSaving(false);
        return;
      }

      // Normalize P&L sign based on the selected outcome.
      let finalPnlAmount = pnlAmountNum;
      let finalPnlPercent = pnlPercentNum;

      if (outcome === 'LOSS') {
        finalPnlAmount = -Math.abs(pnlAmountNum);
        finalPnlPercent = -Math.abs(pnlPercentNum);
      } else if (outcome === 'WIN') {
        finalPnlAmount = Math.abs(pnlAmountNum);
        finalPnlPercent = Math.abs(pnlPercentNum);
      }

      const finalRMultiple =
        riskAmount && !Number.isNaN(riskAmount)
          ? finalPnlAmount / riskAmount
          : null;

      // 1) Create the trade record.
      const { data: created, error: tradeErr } = await supabase
        .from('trades')
        .insert({
          user_id: user.id,
          opened_at: new Date(openedAt).toISOString(),
          instrument,
          direction,
          outcome,
          pnl_amount: finalPnlAmount,
          pnl_percent: finalPnlPercent,
          risk_amount: riskAmount || null,
          r_multiple: finalRMultiple,
          notes: notes || null,
          template_id: templateId || null,
        })
        .select('id')
        .single();

      if (tradeErr || !created?.id) {
        setMsg(tradeErr?.message ?? 'Failed to create trade.');
        setSaving(false);
        return;
      }

      const tradeId = created.id as string;

      // 2) Save checklist adherence for this trade.
      if (templateId && items.length) {
        const payload = items.map((it) => ({
          trade_id: tradeId,
          item_id: it.id,
          checked: !!checks[it.id],
        }));

        const { error: checksErr } = await supabase
          .from('trade_criteria_checks')
          .upsert(payload, { onConflict: 'trade_id,item_id' });

        if (checksErr) {
          console.error(checksErr);
          setMsg(`Saved trade, but checklist failed: ${checksErr.message}`);
          setSaving(false);
          return;
        }
      }

      // 3) Upload BEFORE screenshot (optional) and store its path on the trade.
      if (beforeFile) {
        setMsg('Uploading screenshot...');
        const path = await uploadBeforeScreenshot({
          userId: user.id,
          tradeId,
          file: beforeFile,
        });

        const { error: updErr } = await supabase
          .from('trades')
          .update({ before_screenshot_path: path })
          .eq('id', tradeId);

        if (updErr) {
          setMsg(`Saved trade, but screenshot link failed: ${updErr.message}`);
          setSaving(false);
          return;
        }
      }

      setMsg('Saved');
      router.push('/dashboard');
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Something went wrong.';
      setMsg(message);
      setSaving(false);
    }
  }

  return (
    <main className='p-6 max-w-2xl space-y-6'>
      <header className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold'>Add Trade</h1>
        <button
          className='border rounded-lg px-4 py-2'
          onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </header>

      <form onSubmit={saveTrade} className='space-y-4 border rounded-xl p-4'>
        <Field label='Date/Time'>
          <input
            className='w-full border rounded-lg p-3'
            type='datetime-local'
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
            required
          />
        </Field>

        {/* Setup + checklist at entry */}
        <Field label='Setup (Entry Criteria)'>
          <div className='space-y-3'>
            <select
              className='w-full border rounded-lg p-3'
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}>
              {!templates.length && <option value=''>No setups yet</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>

            {templateId && items.length > 0 ? (
              <div className='border rounded-lg p-3 space-y-2'>
                <div className='flex items-center justify-between'>
                  <div className='text-sm opacity-70'>
                    Tick what you followed at entry (unchecked = missed
                    criteria)
                  </div>
                  <div className='text-sm font-semibold'>
                    {checklistScore === null ? '—' : `${checklistScore}%`}
                  </div>
                </div>

                <div className='grid grid-cols-1 gap-2'>
                  {items.map((it) => (
                    <label
                      key={it.id}
                      className='flex items-center gap-3 border rounded-lg px-3 py-2'>
                      <input
                        type='checkbox'
                        checked={!!checks[it.id]}
                        onChange={() => toggle(it.id)}
                      />
                      <span className='text-sm'>{it.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : templateId ? (
              <div className='text-sm opacity-70'>
                This setup has no active checklist items.
              </div>
            ) : (
              <div className='text-sm opacity-70'>
                Create a setup in <span className='font-semibold'>Setups</span>{' '}
                first.
              </div>
            )}

            <div className='text-xs opacity-60'>
              Manage setups in{' '}
              <button
                type='button'
                className='underline'
                onClick={() => router.push('/settings/setups')}>
                Settings → Setups
              </button>
            </div>
          </div>
        </Field>

        {/* BEFORE trade screenshot (setup screenshot) */}
        <section className='border rounded-xl p-4 space-y-2'>
          <div className='font-semibold'>Before-Trade Screenshot</div>
          <div className='text-sm opacity-70'>
            Upload your setup screenshot (before you enter). Optional.
          </div>

          <input
            className='block'
            type='file'
            accept='image/*'
            onChange={(e) => onBeforeFileChange(e.target.files?.[0] ?? null)}
          />

          <div className='text-xs opacity-70'>
            {beforeFile
              ? `Selected: ${beforeFile.name}`
              : 'No screenshot selected.'}
          </div>

          {beforePreviewUrl && (
            <Image
              src={beforePreviewUrl}
              alt='Before screenshot preview'
              width={1200}
              height={700}
              unoptimized
              className='max-h-64 w-auto rounded-lg border'
            />
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
              onChange={(e) => setDirection(toDirection(e.target.value))}>
              <option value='BUY'>BUY</option>
              <option value='SELL'>SELL</option>
            </select>
          </Field>

          <Field label='Outcome'>
            <select
              className='w-full border rounded-lg p-3'
              value={outcome}
              onChange={(e) => setOutcome(toOutcome(e.target.value))}>
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

        <button
          className='w-full border rounded-lg p-3 disabled:opacity-60'
          disabled={saving}>
          Save Trade
        </button>

        {msg && <p className='text-sm opacity-80'>{msg}</p>}
      </form>
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