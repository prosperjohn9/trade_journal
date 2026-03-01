'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import { listAccounts } from '@/src/lib/services/accounts.service';
import {
  createTradeFlow,
  getDefaultMonthDatetimeLocal,
  loadNewTradeBootstrap,
} from '@/src/lib/services/newTrade.service';
import { toNumberSafe } from '@/src/lib/utils/number';

export type Direction = 'BUY' | 'SELL';
export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export type SetupTemplate = {
  id: string;
  name: string;
  is_default: boolean;
};

export type AccountLite = {
  id: string;
  name: string;
  account_type: string;
  is_default: boolean;
  base_currency: string | null;
  starting_balance: number;
};

const RECENT_INSTRUMENTS_KEY = 'new-trade-recent-instruments-v1';
const MAX_RECENT_INSTRUMENTS = 8;
const MAX_RISK_PERCENT = 2;
const FAVORITE_INSTRUMENTS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'BTCUSD'];

function normalizeInstrument(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizePnlByOutcome(outcome: Outcome, amount: number): number {
  if (outcome === 'LOSS') return -Math.abs(amount);
  if (outcome === 'WIN') return Math.abs(amount);
  return amount;
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeInstrument(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export function useNewTrade() {
  const router = useRouter();

  const [openedAt, setOpenedAt] = useState(getDefaultMonthDatetimeLocal);

  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  const [pnlAmount, setPnlAmount] = useState<string>('2000');
  const [riskAmount, setRiskAmount] = useState<number>(1000);

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState<string>('');

  const [templates, setTemplates] = useState<SetupTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');

  const [recentInstruments, setRecentInstruments] = useState<string[]>([]);

  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string>('');
  const beforePreviewUrlRef = useRef<string>('');

  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const hasAccounts = accounts.length > 0;

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );
  const selectedAccountBalance = useMemo(
    () => toNumberSafe(selectedAccount?.starting_balance, 0),
    [selectedAccount?.starting_balance],
  );
  const selectedCurrency = selectedAccount?.base_currency ?? 'USD';

  const pnlAmountNumber = useMemo(() => toNumberSafe(pnlAmount, 0), [pnlAmount]);
  const normalizedPnlAmount = useMemo(
    () => normalizePnlByOutcome(outcome, pnlAmountNumber),
    [outcome, pnlAmountNumber],
  );

  const pnlPercentNumber = useMemo(() => {
    if (!selectedAccountBalance) return null;
    return (normalizedPnlAmount / selectedAccountBalance) * 100;
  }, [normalizedPnlAmount, selectedAccountBalance]);

  const pnlPercent = useMemo(() => {
    if (pnlPercentNumber === null || Number.isNaN(pnlPercentNumber)) return '—';
    return pnlPercentNumber.toFixed(2);
  }, [pnlPercentNumber]);

  const rMultiple = useMemo(() => {
    if (!riskAmount || Number.isNaN(riskAmount)) return null;
    return normalizedPnlAmount / riskAmount;
  }, [normalizedPnlAmount, riskAmount]);

  const riskPercentOfAccount = useMemo(() => {
    if (!selectedAccountBalance || !riskAmount || Number.isNaN(riskAmount)) {
      return null;
    }
    return (riskAmount / selectedAccountBalance) * 100;
  }, [riskAmount, selectedAccountBalance]);

  const riskExceedsPolicy = useMemo(
    () =>
      riskPercentOfAccount !== null &&
      Number.isFinite(riskPercentOfAccount) &&
      riskPercentOfAccount > MAX_RISK_PERCENT,
    [riskPercentOfAccount],
  );

  const favoriteInstruments = useMemo(() => FAVORITE_INSTRUMENTS, []);
  const instrumentSuggestions = useMemo(
    () =>
      uniqueInOrder([
        instrument,
        ...recentInstruments,
        ...favoriteInstruments,
      ]),
    [favoriteInstruments, instrument, recentInstruments],
  );

  const canSave = useMemo(() => {
    if (!hasAccounts) return false;
    if (!accountId.trim()) return false;
    if (!openedAt.trim()) return false;
    if (!normalizeInstrument(instrument)) return false;
    const pnlNum = Number(pnlAmount);
    return Number.isFinite(pnlNum);
  }, [accountId, hasAccounts, instrument, openedAt, pnlAmount]);

  function persistRecentInstruments(next: string[]) {
    setRecentInstruments(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RECENT_INSTRUMENTS_KEY, JSON.stringify(next));
    }
  }

  function recordRecentInstrument(value: string) {
    const normalized = normalizeInstrument(value);
    if (!normalized) return;

    setRecentInstruments((prev) => {
      const next = uniqueInOrder([normalized, ...prev]).slice(
        0,
        MAX_RECENT_INSTRUMENTS,
      );

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_INSTRUMENTS_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  function onBeforeFileChange(file: File | null) {
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

  function selectInstrument(next: string) {
    setInstrument(normalizeInstrument(next));
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(RECENT_INSTRUMENTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      persistRecentInstruments(uniqueInOrder(parsed).slice(0, MAX_RECENT_INSTRUMENTS));
    } catch {
      persistRecentInstruments([]);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (beforePreviewUrlRef.current) {
        URL.revokeObjectURL(beforePreviewUrlRef.current);
        beforePreviewUrlRef.current = '';
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setMsg('');
      if (!cancelled) setInitialized(false);

      try {
        const accList = (await listAccounts()) as AccountLite[];
        if (cancelled) return;

        setAccounts(accList);
        const defAcc = accList.find((a) => a.is_default);
        setAccountId((prev) => prev || (defAcc?.id ?? accList[0]?.id ?? ''));

        const boot = await loadNewTradeBootstrap();
        if (cancelled) return;

        setTemplates(boot.templates);
        setTemplateId((prev) => prev || boot.defaultTemplateId);
      } catch (e: unknown) {
        const m = getErr(e, 'Failed to load Add Trade');
        setMsg(m);
        if (m.toLowerCase().includes('not authenticated')) router.push('/auth');
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSaveTrade(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (!accountId) {
      setMsg('Please create/select an account first.');
      return;
    }

    const nextInstrument = normalizeInstrument(instrument);
    if (!nextInstrument) {
      setMsg('Instrument is required.');
      return;
    }

    const pnlPercentRaw = Number.isFinite(pnlPercentNumber ?? NaN)
      ? String(pnlPercentNumber)
      : '0';

    setSaving(true);
    setMsg('Saving...');

    try {
      await createTradeFlow({
        accountId,
        openedAtLocal: openedAt,
        instrument: nextInstrument,
        direction,
        outcome,
        pnlAmountRaw: pnlAmount,
        pnlPercentRaw,
        riskAmount,
        notes,
        templateId: templateId || null,
        beforeFile,
      });

      recordRecentInstrument(nextInstrument);
      setMsg('Saved');
      router.push('/dashboard');
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to save trade'));
    } finally {
      setSaving(false);
    }
  }

  return {
    accounts,
    accountId,
    setAccountId,
    hasAccounts,

    openedAt,
    setOpenedAt,
    instrument,
    setInstrument: selectInstrument,
    direction,
    setDirection,
    outcome,
    setOutcome,
    pnlAmount,
    setPnlAmount,
    pnlPercent,
    pnlPercentNumber,
    riskAmount,
    setRiskAmount,
    rMultiple,
    selectedCurrency,
    selectedAccount,
    selectedAccountBalance,
    riskPercentOfAccount,
    riskExceedsPolicy,
    maxRiskPercent: MAX_RISK_PERCENT,

    favoriteInstruments,
    recentInstruments,
    instrumentSuggestions,

    templates,
    templateId,
    setTemplateId,

    beforeFile,
    beforePreviewUrl,
    onBeforeFileChange,

    notes,
    setNotes,
    msg,
    saving,
    initialized,
    canSave,
    onSaveTrade,
  };
}
