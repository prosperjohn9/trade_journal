'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import { listAccounts } from '@/src/lib/services/accounts.service';
import type { Account } from '@/src/domain/account';
import type { SetupTemplateRow } from '@/src/lib/db/setupTemplates.repo';

import type { SetupItemWithActiveRow } from '@/src/lib/db/setupTemplateItems.repo';
import type {
  Direction,
  Outcome,
} from '@/src/lib/services/tradeEdit.service';
import {
  loadTradeEditBootstrap,
  loadTradeEditChecklist,
  loadTradeEditTemplates,
  saveTradeEntryFlow,
  toDatetimeLocalValue,
} from '@/src/lib/services/tradeEdit.service';

type AccountLite = Pick<Account, 'id' | 'name' | 'is_default' | 'starting_balance'>;

function fileSignature(file: File | null): string {
  if (!file) return '';
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function buildDraftSnapshot(params: {
  accountId: string;
  openedAt: string;
  instrument: string;
  direction: Direction;
  outcome: Outcome;
  pnlAmount: string;
  riskAmount: number;
  notes: string;
  templateId: string | null;
  beforeFileSig: string;
  afterFileSig: string;
}) {
  return JSON.stringify(params);
}

function buildPerformanceSnapshot(params: {
  instrument: string;
  direction: Direction;
  outcome: Outcome;
  pnlAmount: string;
  riskAmount: number;
}) {
  return JSON.stringify({
    instrument: params.instrument.trim().toUpperCase(),
    direction: params.direction,
    outcome: params.outcome,
    pnlAmount: params.pnlAmount.trim(),
    riskAmount: Number.isFinite(params.riskAmount) ? params.riskAmount : 0,
  });
}

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
  const searchParams = useSearchParams();
  const tradeId = params.id;
  const returnToParam = searchParams.get('returnTo');
  const returnTo =
    returnToParam && returnToParam.startsWith('/') ? returnToParam : null;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [entryMsg, setEntryMsg] = useState('');
  const [entryMsgTone, setEntryMsgTone] = useState<
    'success' | 'error' | 'info'
  >('info');

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
  const [baselineDraft, setBaselineDraft] = useState<string | null>(null);
  const [baselinePerformance, setBaselinePerformance] = useState<string | null>(
    null,
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  const selectedAccountBalance = useMemo(() => {
    const n = Number(selectedAccount?.starting_balance ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [selectedAccount?.starting_balance]);

  const pnlAmountNumber = useMemo(() => Number(pnlAmount || 0), [pnlAmount]);

  const normalizedPnlAmount = useMemo(() => {
    if (!Number.isFinite(pnlAmountNumber)) return 0;
    if (outcome === 'LOSS') return -Math.abs(pnlAmountNumber);
    if (outcome === 'WIN') return Math.abs(pnlAmountNumber);
    return pnlAmountNumber;
  }, [outcome, pnlAmountNumber]);

  const pnlPercentAuto = useMemo(() => {
    if (!selectedAccountBalance) return null;
    return (normalizedPnlAmount / selectedAccountBalance) * 100;
  }, [normalizedPnlAmount, selectedAccountBalance]);

  const rMultiple = useMemo(() => {
    if (
      !riskAmount ||
      Number.isNaN(riskAmount) ||
      Number.isNaN(normalizedPnlAmount)
    ) {
      return null;
    }

    return normalizedPnlAmount / riskAmount;
  }, [normalizedPnlAmount, riskAmount]);

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

  const grossPnlNumber = useMemo(() => normalizedPnlAmount, [normalizedPnlAmount]);

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
  const beforeFileSig = useMemo(() => fileSignature(beforeFile), [beforeFile]);
  const afterFileSig = useMemo(() => fileSignature(afterFile), [afterFile]);

  const draftSnapshot = useMemo(
    () =>
      buildDraftSnapshot({
        accountId,
        openedAt,
        instrument,
        direction,
        outcome,
        pnlAmount,
        riskAmount,
        notes,
        templateId,
        beforeFileSig,
        afterFileSig,
      }),
    [
      accountId,
      openedAt,
      instrument,
      direction,
      outcome,
      pnlAmount,
      riskAmount,
      notes,
      templateId,
      beforeFileSig,
      afterFileSig,
    ],
  );

  const performanceSnapshot = useMemo(
    () =>
      buildPerformanceSnapshot({
        instrument,
        direction,
        outcome,
        pnlAmount,
        riskAmount,
      }),
    [instrument, direction, outcome, pnlAmount, riskAmount],
  );

  const isDirty = useMemo(() => {
    if (baselineDraft === null) return false;
    return draftSnapshot !== baselineDraft;
  }, [baselineDraft, draftSnapshot]);

  const performanceAffectsReview = useMemo(() => {
    if (baselinePerformance === null) return false;
    return performanceSnapshot !== baselinePerformance;
  }, [baselinePerformance, performanceSnapshot]);

  function confirmDiscardChanges() {
    if (!isDirty) return true;
    return window.confirm('Discard changes?');
  }

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
    if (!confirmDiscardChanges()) return;

    if (returnTo) {
      router.push(returnTo);
      return;
    }

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
    if (!isDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isDirty]);

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

        setBaselineDraft(
          buildDraftSnapshot({
            accountId: res.trade.account_id ?? fallbackAccountId,
            openedAt: toDatetimeLocalValue(res.trade.opened_at),
            instrument: (res.trade.instrument ?? 'EURUSD').toUpperCase(),
            direction: (res.trade.direction ?? 'BUY') as Direction,
            outcome: (res.trade.outcome ?? 'WIN') as Outcome,
            pnlAmount: String(res.trade.pnl_amount ?? 0),
            riskAmount: res.trade.risk_amount ?? 1000,
            notes: res.trade.notes ?? '',
            templateId: res.trade.template_id ?? null,
            beforeFileSig: '',
            afterFileSig: '',
          }),
        );
        setBaselinePerformance(
          buildPerformanceSnapshot({
            instrument: (res.trade.instrument ?? 'EURUSD').toUpperCase(),
            direction: (res.trade.direction ?? 'BUY') as Direction,
            outcome: (res.trade.outcome ?? 'WIN') as Outcome,
            pnlAmount: String(res.trade.pnl_amount ?? 0),
            riskAmount: res.trade.risk_amount ?? 1000,
          }),
        );
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

    const shouldResetReview = !!reviewedAt && performanceAffectsReview;
    if (shouldResetReview) {
      const ok = window.confirm(
        'Editing performance metrics will reset the review. Continue?',
      );
      if (!ok) return;
    }

    setEntryFeedback('Saving changes...', 'info');
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
        pnlPercentRaw: String(pnlPercentAuto ?? 0),
        riskAmount,
        notes,
        templateId,
        beforeFile,
        afterFile,
        resetReview: shouldResetReview,
      });

      setBeforeFileWithPreview(null);
      setAfterFileWithPreview(null);

      if (res.beforeSignedUrl !== undefined)
        setBeforeSignedUrl(res.beforeSignedUrl);
      if (res.afterSignedUrl !== undefined)
        setAfterSignedUrl(res.afterSignedUrl);
      if (shouldResetReview) setReviewedAt(null);

      setBaselineDraft(
        buildDraftSnapshot({
          accountId,
          openedAt,
          instrument,
          direction,
          outcome,
          pnlAmount,
          riskAmount,
          notes,
          templateId,
          beforeFileSig: '',
          afterFileSig: '',
        }),
      );
      setBaselinePerformance(
        buildPerformanceSnapshot({
          instrument,
          direction,
          outcome,
          pnlAmount,
          riskAmount,
        }),
      );

      goBackSafe();
    } catch (e: unknown) {
      setEntryFeedback(getErr(e, 'Failed to save changes'), 'error');
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
    confirmDiscardChanges,
    openFull,

    accounts,
    accountId,
    setAccountId,
    hasAccounts,
    selectedAccount,
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
    pnlPercentAuto,
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
    isDirty,

    saveEntry,
  };
}

export type TradeEditState = ReturnType<typeof useTradeEdit>;
