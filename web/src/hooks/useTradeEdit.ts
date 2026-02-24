'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import { listAccounts } from '@/src/lib/services/accounts.service';
import type { Account } from '@/src/domain/account';
import type { SetupTemplateRow } from '@/src/lib/db/setupTemplates.repo';

import type { SetupItemWithActiveRow } from '@/src/lib/db/setupTemplateItems.repo';
import type {
  Direction,
  Outcome,
  TradeEditRow,
} from '@/src/lib/services/tradeEdit.service';
import {
  loadTradeEditBootstrap,
  loadTradeEditChecklist,
  loadTradeEditTemplates,
  saveTradeEntryFlow,
  saveTradeReviewFlow,
  toDatetimeLocalValue,
} from '@/src/lib/services/tradeEdit.service';

type AccountLite = Pick<Account, 'id' | 'name' | 'is_default'>;

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

  const [entryMsg, setEntryMsg] = useState('');
  const [entryMsgTone, setEntryMsgTone] = useState<
    'success' | 'error' | 'info'
  >('info');

  const [trade, setTrade] = useState<TradeEditRow | null>(null);

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState('');

  const [openedAt, setOpenedAt] = useState('');
  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  const [pnlAmount, setPnlAmount] = useState('0');
  const [pnlPercent, setPnlPercent] = useState('0');
  const [riskAmount, setRiskAmount] = useState<number>(1000);
  const [notes, setNotes] = useState('');

  const [templates, setTemplates] = useState<SetupTemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [items, setItems] = useState<SetupItemWithActiveRow[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const [beforeSignedUrl, setBeforeSignedUrl] = useState('');
  const [afterSignedUrl, setAfterSignedUrl] = useState('');

  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState('');
  const beforePreviewRef = useRef<string>('');

  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState('');
  const afterPreviewRef = useRef<string>('');

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
  const hasAccounts = accounts.length > 0;
  const isCurrentAccountMissing = useMemo(
    () => !!accountId && !accounts.some((a) => a.id === accountId),
    [accountId, accounts],
  );
  const isCurrentTemplateMissing = useMemo(
    () => !!templateId && !templates.some((t) => t.id === templateId),
    [templateId, templates],
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

  useEffect(() => {
    return () => {
      if (beforePreviewRef.current)
        URL.revokeObjectURL(beforePreviewRef.current);
      if (afterPreviewRef.current) URL.revokeObjectURL(afterPreviewRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setMsg('');

      try {
        const [res, loadedAccounts, loadedTemplates] = await Promise.all([
          loadTradeEditBootstrap({ tradeId }),
          listAccounts(),
          loadTradeEditTemplates(),
        ]);
        if (cancelled) return;

        setAccounts(loadedAccounts);
        setTemplates(loadedTemplates);
        const fallbackAccountId =
          loadedAccounts.find((a) => a.is_default)?.id ??
          loadedAccounts[0]?.id ??
          '';

        setTrade(res.trade);

        setAccountId(res.trade.account_id ?? fallbackAccountId);
        setOpenedAt(toDatetimeLocalValue(res.trade.opened_at));
        setInstrument((res.trade.instrument ?? 'EURUSD').toUpperCase());
        setDirection((res.trade.direction ?? 'BUY') as Direction);
        setOutcome((res.trade.outcome ?? 'WIN') as Outcome);
        setPnlAmount(String(res.trade.pnl_amount ?? 0));
        setPnlPercent(String(res.trade.pnl_percent ?? 0));
        setRiskAmount(res.trade.risk_amount ?? 1000);
        setNotes(res.trade.notes ?? '');

        setTemplateId(res.trade.template_id ?? null);
        setItems(res.items);
        setChecks(res.checks);

        setBeforeSignedUrl(res.beforeSignedUrl);
        setAfterSignedUrl(res.afterSignedUrl);

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

  useEffect(() => {
    let cancelled = false;
    if (!templateId) {
      setItems([]);
      setChecks({});
      return;
    }

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
    if (!accountId) {
      setEntryFeedback('Please select an account first.', 'error');
      return;
    }

    setEntryFeedback('Saving entry...', 'info');
    setMsg('');

    try {
      const res = await saveTradeEntryFlow({
        tradeId,
        accountId,
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

      setBeforeFileWithPreview(null);

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

    entryMsg,
    entryMsgClasses,

    goBackSafe,
    openFull,

    accounts,
    accountId,
    setAccountId,
    hasAccounts,
    isCurrentAccountMissing,
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

    templateId,
    setTemplateId,
    templates,
    isCurrentTemplateMissing,
    items,
    activeItems,
    checks,
    toggleCheck,
    adherence,

    beforeSignedUrl,
    beforeFile,
    beforePreviewUrl,
    setBeforeFileWithPreview,

    afterSignedUrl,
    afterFile,
    afterPreviewUrl,
    setAfterFileWithPreview,

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

    saveEntry,
    saveReview,
  };
}

export type TradeEditState = ReturnType<typeof useTradeEdit>;