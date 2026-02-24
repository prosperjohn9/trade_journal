'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';

import type { SetupItemWithActiveRow } from '@/src/lib/db/setupTemplateItems.repo';
import type {
  Direction,
  Outcome,
  TradeEditRow,
} from '@/src/lib/services/tradeEdit.service';
import {
  loadTradeEditBootstrap,
  loadTradeEditChecklist,
  saveTradeEntryFlow,
  saveTradeReviewFlow,
  toDatetimeLocalValue,
} from '@/src/lib/services/tradeEdit.service';

export function parseDirection(v: string): Direction {
  return v === 'SELL' ? 'SELL' : 'BUY';
}

export function parseOutcome(v: string): Outcome {
  if (v === 'LOSS') return 'LOSS';
  if (v === 'BREAKEVEN') return 'BREAKEVEN';
  return 'WIN';
}

export function useTradeEdit() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const tradeId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Entry feedback
  const [entryMsg, setEntryMsg] = useState('');
  const [entryMsgTone, setEntryMsgTone] = useState<
    'success' | 'error' | 'info'
  >('info');

  const [trade, setTrade] = useState<TradeEditRow | null>(null);

  // ENTRY FIELDS
  const [openedAt, setOpenedAt] = useState('');
  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  const [pnlAmount, setPnlAmount] = useState('0');
  const [pnlPercent, setPnlPercent] = useState('0');
  const [riskAmount, setRiskAmount] = useState<number>(1000);
  const [notes, setNotes] = useState('');

  // CHECKLIST
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems] = useState<SetupItemWithActiveRow[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // SIGNED URLS (already signed by service)
  const [beforeSignedUrl, setBeforeSignedUrl] = useState('');
  const [afterSignedUrl, setAfterSignedUrl] = useState('');

  // FILES + PREVIEWS
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState('');
  const beforePreviewRef = useRef<string>('');

  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState('');
  const afterPreviewRef = useRef<string>('');

  // REVIEW FIELDS
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);

  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [closedAtLocal, setClosedAtLocal] = useState('');
  const [commission, setCommission] = useState('0');
  const [netPnl, setNetPnl] = useState('');
  const [emotionTag, setEmotionTag] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  // computed
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
    [grossPnlNumber, commissionNumber],
  );

  function toggleCheck(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  function setEntryFeedback(
    text: string,
    tone: 'success' | 'error' | 'info' = 'info',
  ) {
    setEntryMsg(text);
    setEntryMsgTone(tone);
    if (tone === 'success') window.setTimeout(() => setEntryMsg(''), 2500);
  }

  function goBackSafe() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/trades/${tradeId}`);
  }

  function openFull(url: string) {
    if (!url) return;
    window.open(url, '_blank');
  }

  function setBeforeFileWithPreview(file: File | null) {
    if (beforePreviewRef.current) URL.revokeObjectURL(beforePreviewRef.current);
    beforePreviewRef.current = '';
    setBeforeFile(file);

    if (!file) {
      setBeforePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    beforePreviewRef.current = url;
    setBeforePreviewUrl(url);
  }

  function setAfterFileWithPreview(file: File | null) {
    if (afterPreviewRef.current) URL.revokeObjectURL(afterPreviewRef.current);
    afterPreviewRef.current = '';
    setAfterFile(file);

    if (!file) {
      setAfterPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    afterPreviewRef.current = url;
    setAfterPreviewUrl(url);
  }

  // cleanup previews
  useEffect(() => {
    return () => {
      if (beforePreviewRef.current)
        URL.revokeObjectURL(beforePreviewRef.current);
      if (afterPreviewRef.current) URL.revokeObjectURL(afterPreviewRef.current);
    };
  }, []);

  // initial load
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const res = await loadTradeEditBootstrap({ tradeId });
        if (cancelled) return;

        setTrade(res.trade);

        // entry
        setOpenedAt(toDatetimeLocalValue(res.trade.opened_at));
        setInstrument((res.trade.instrument ?? 'EURUSD').toUpperCase());
        setDirection((res.trade.direction ?? 'BUY') as Direction);
        setOutcome((res.trade.outcome ?? 'WIN') as Outcome);
        setPnlAmount(String(res.trade.pnl_amount ?? 0));
        setPnlPercent(String(res.trade.pnl_percent ?? 0));
        setRiskAmount(res.trade.risk_amount ?? 1000);
        setNotes(res.trade.notes ?? '');

        // checklist
        setTemplateId(res.trade.template_id ?? null);
        setItems(res.items);
        setChecks(res.checks);

        // signed URLs
        setBeforeSignedUrl(res.beforeSignedUrl);
        setAfterSignedUrl(res.afterSignedUrl);

        // review
        setReviewedAt(res.trade.reviewed_at ?? null);
        setEntryPrice(
          res.trade.entry_price == null ? '' : String(res.trade.entry_price),
        );
        setStopLoss(
          res.trade.stop_loss == null ? '' : String(res.trade.stop_loss),
        );
        setTakeProfit(
          res.trade.take_profit == null ? '' : String(res.trade.take_profit),
        );
        setExitPrice(
          res.trade.exit_price == null ? '' : String(res.trade.exit_price),
        );
        setClosedAtLocal(
          res.trade.closed_at ? toDatetimeLocalValue(res.trade.closed_at) : '',
        );
        setCommission(
          res.trade.commission == null ? '0' : String(res.trade.commission),
        );
        setNetPnl(res.trade.net_pnl == null ? '' : String(res.trade.net_pnl));
        setEmotionTag(res.trade.emotion_tag ?? '');
        setLessonLearned(res.trade.lesson_learned ?? '');
        setReviewNotes(res.trade.review_notes ?? '');
      } catch (e: unknown) {
        if (!cancelled) {
          setMsg(getErr(e, 'Failed to load trade'));
          router.push('/auth');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tradeId, router]);

  // reload checklist when template changes
  useEffect(() => {
    let cancelled = false;
    if (!templateId) return;

    (async () => {
      try {
        const res = await loadTradeEditChecklist({ tradeId, templateId });
        if (cancelled) return;

        setItems(res.items);
        setChecks(res.checks);
      } catch (e: unknown) {
        if (!cancelled) setMsg(getErr(e, 'Failed to load checklist'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId, tradeId]);

  async function saveEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEntryFeedback('Saving entry...', 'info');
    setMsg('');

    try {
      const res = await saveTradeEntryFlow({
        tradeId,
        openedAtLocal: openedAt,
        instrument,
        direction,
        outcome,
        pnlAmountRaw: pnlAmount,
        pnlPercentRaw: pnlPercent,
        riskAmount,
        notes,
        templateId,
        items,
        checks,
        beforeFile,
      });

      // After saving, clear local file + preview
      setBeforeFileWithPreview(null);

      // Re-sign preview by reloading page state? Not needed — edit page uses signed urls.
      // If you want immediate refresh for beforeSignedUrl, you can reload bootstrap. Optional.
      if (res.beforeSignedUrl !== undefined)
        setBeforeSignedUrl(res.beforeSignedUrl);

      setEntryFeedback('Entry saved successfully.', 'success');
    } catch (e: unknown) {
      setEntryFeedback(getErr(e, 'Failed to save entry'), 'error');
    }
  }

  async function saveReview() {
    setMsg('Saving review...');

    try {
      const res = await saveTradeReviewFlow({
        tradeId,
        pnlAmount: Number(trade?.pnl_amount ?? grossPnlNumber),

        entryPrice,
        stopLoss,
        takeProfit,
        exitPrice,
        closedAtLocal,

        commissionRaw: commission,
        netPnlRaw: netPnl,

        emotionTag,
        lessonLearned,
        reviewNotes,

        afterFile,
        reviewedAtExisting: reviewedAt,
      });

      setAfterFileWithPreview(null);
      setReviewedAt(res.reviewedAt);

      if (res.afterSignedUrl !== undefined)
        setAfterSignedUrl(res.afterSignedUrl);

      setMsg('Review saved successfully.');
      goBackSafe();
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to save review'));
    }
  }

  const entryMsgClasses =
    entryMsgTone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : entryMsgTone === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : 'border-slate-200 bg-slate-50 text-slate-800';

  return {
    loading,
    msg,

    // entry feedback
    entryMsg,
    entryMsgClasses,

    // navigation
    goBackSafe,
    openFull,

    // entry
    openedAt,
    setOpenedAt,
    instrument,
    setInstrument,
    direction,
    setDirection,
    outcome,
    setOutcome,
    pnlAmount,
    setPnlAmount,
    pnlPercent,
    setPnlPercent,
    riskAmount,
    setRiskAmount,
    notes,
    setNotes,

    rMultiple,

    // checklist
    templateId,
    setTemplateId,
    items,
    activeItems,
    checks,
    toggleCheck,
    adherence,

    // screenshots (signed urls)
    beforeSignedUrl,
    beforeFile,
    beforePreviewUrl,
    setBeforeFileWithPreview,

    afterSignedUrl,
    afterFile,
    afterPreviewUrl,
    setAfterFileWithPreview,

    // review
    reviewedAt,
    entryPrice,
    setEntryPrice,
    stopLoss,
    setStopLoss,
    takeProfit,
    setTakeProfit,
    exitPrice,
    setExitPrice,
    closedAtLocal,
    setClosedAtLocal,
    commission,
    setCommission,
    netPnl,
    setNetPnl,
    emotionTag,
    setEmotionTag,
    lessonLearned,
    setLessonLearned,
    reviewNotes,
    setReviewNotes,

    grossPnlNumber,
    netPnlComputed,

    // actions
    saveEntry,
    saveReview,
  };
}

export type TradeEditState = ReturnType<typeof useTradeEdit>;