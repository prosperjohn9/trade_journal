'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getErr } from '@/src/domain/errors';

import type { SetupTemplateRow } from '@/src/lib/db/setupTemplates.repo';
import type { SetupTemplateItemRow } from '@/src/lib/db/setupTemplateItems.repo';
import type { TradeReviewRow } from '@/src/lib/services/tradeReview.service';

import {
  loadTradeReviewBootstrap,
  loadTradeReviewChecklist,
  signTradeScreenshotPath,
  toLocalDatetimeValue,
  saveTradeReviewFlow,
} from '@/src/lib/services/tradeReview.service';

export function useTradeReview() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tradeId = params.id;

  const returnToParam = searchParams.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') ? returnToParam : null;

  const backHref = returnTo ?? `/trades/${tradeId}`;

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [trade, setTrade] = useState<TradeReviewRow | null>(null);

  const [templates, setTemplates] = useState<SetupTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>('');

  const [items, setItems] = useState<SetupTemplateItemRow[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [closedAt, setClosedAt] = useState('');
  const [commission, setCommission] = useState('0');

  const [emotionTag, setEmotionTag] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string>('');
  const afterPreviewUrlRef = useRef<string>('');

  const [afterSignedUrl, setAfterSignedUrl] = useState<string>('');

  const activeItems = useMemo(
    () => items.filter((i) => i.is_active),
    [items],
  );

  const adherence = useMemo(() => {
    const total = activeItems.length;
    if (!total) return { total: 0, checked: 0, pct: 0 };
    const checkedCount = activeItems.filter((i) => checks[i.id]).length;
    return { total, checked: checkedCount, pct: (checkedCount / total) * 100 };
  }, [activeItems, checks]);

  const missedCount = useMemo(() => {
    if (!activeItems.length) return 0;
    return activeItems.filter((i) => !checks[i.id]).length;
  }, [activeItems, checks]);

  const grossPnl = Number(trade?.pnl_amount ?? 0);

  const commissionNum = useMemo(() => {
    const t = commission.trim();
    if (!t) return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }, [commission]);

  const netPnl = grossPnl - commissionNum;

  function toggleCheck(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  function onAfterFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

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

  useEffect(() => {
    return () => {
      if (afterPreviewUrlRef.current) {
        URL.revokeObjectURL(afterPreviewUrlRef.current);
        afterPreviewUrlRef.current = '';
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const res = await loadTradeReviewBootstrap({ tradeId });
        if (cancelled) return;

        setTrade(res.trade);
        setTemplates(res.templates);
        setTemplateId(res.templateId);

        setItems(res.items);
        setChecks(res.checks);

        const t = res.trade;
        setEntryPrice(t.entry_price?.toString() ?? '');
        setStopLoss(t.stop_loss?.toString() ?? '');
        setTakeProfit(t.take_profit?.toString() ?? '');
        setExitPrice(t.exit_price?.toString() ?? '');
        setClosedAt(toLocalDatetimeValue(t.closed_at));
        setCommission(String(t.commission ?? 0));

        setEmotionTag(t.emotion_tag ?? '');
        setLessonLearned(t.lesson_learned ?? '');
        setReviewNotes(t.review_notes ?? '');

        setAfterSignedUrl('');
        if (t.after_trade_screenshot_url) {
          const url = await signTradeScreenshotPath(
            t.after_trade_screenshot_url,
          );
          if (!cancelled) setAfterSignedUrl(url);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setMsg(getErr(e, 'Failed to load trade review'));
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

  useEffect(() => {
    let cancelled = false;
    if (!trade) return;
    if (!templateId) return;

    (async () => {
      try {
        const res = await loadTradeReviewChecklist({ tradeId, templateId });
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
  }, [templateId, tradeId, trade]);

  async function openAfterScreenshot() {
    if (afterSignedUrl) {
      window.open(afterSignedUrl, '_blank');
      return;
    }

    if (!trade?.after_trade_screenshot_url) return;

    const url = await signTradeScreenshotPath(
      trade.after_trade_screenshot_url,
      60,
    );
    if (!url) {
      alert('Could not open screenshot');
      return;
    }
    window.open(url, '_blank');
  }

  async function saveAndMarkReviewed() {
    if (!trade) return;
    if (saving) return;

    setSaving(true);
    setMsg('Saving...');

    try {
      await saveTradeReviewFlow({
        tradeId: trade.id,
        templateId: templateId || null,

        pnlAmount: Number(trade.pnl_amount ?? 0),

        entryPrice,
        stopLoss,
        takeProfit,
        exitPrice,
        closedAtLocal: closedAt,
        commissionRaw: commission,

        emotionTag,
        lessonLearned,
        reviewNotes,

        activeItems: activeItems.map((i) => ({ id: i.id })),
        checks,

        afterFile,
      });

      setMsg('Reviewed successfully. Returning...');
      goBack();
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to save review'));
      setSaving(false);
    }
  }

  return {
    loading,
    saving,
    msg,

    trade,
    templates,
    templateId,
    setTemplateId,

    items,
    activeItems,
    checks,
    toggleCheck,
    adherence,
    missedCount,

    grossPnl,
    netPnl,

    entryPrice,
    setEntryPrice,
    stopLoss,
    setStopLoss,
    takeProfit,
    setTakeProfit,
    exitPrice,
    setExitPrice,
    closedAt,
    setClosedAt,
    commission,
    setCommission,

    emotionTag,
    setEmotionTag,
    lessonLearned,
    setLessonLearned,
    reviewNotes,
    setReviewNotes,

    afterFile,
    afterPreviewUrl,
    afterSignedUrl,
    onAfterFileChange,
    openAfterScreenshot,

    goBack,
    saveAndMarkReviewed,
  };
}

export type TradeReviewState = ReturnType<typeof useTradeReview>;