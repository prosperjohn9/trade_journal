'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getErr } from '@/src/domain/errors';
import { listAccounts } from '@/src/lib/services/accounts.service';
import {
  createTradeFlow,
  getDefaultMonthDatetimeLocal,
  loadNewTradeBootstrap,
  loadSetupItemsForTemplate,
} from '@/src/lib/services/newTrade.service';

export type Direction = 'BUY' | 'SELL';
export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export type SetupTemplate = {
  id: string;
  name: string;
  is_default: boolean;
};

export type SetupItem = {
  id: string;
  label: string;
  sort_order: number;
};

export type AccountLite = {
  id: string;
  name: string;
  is_default: boolean;
  base_currency: string | null;
  starting_balance: number;
};

export function useNewTrade() {
  const router = useRouter();

  const [openedAt, setOpenedAt] = useState(getDefaultMonthDatetimeLocal);

  const [instrument, setInstrument] = useState('EURUSD');
  const [direction, setDirection] = useState<Direction>('BUY');
  const [outcome, setOutcome] = useState<Outcome>('WIN');

  const [pnlAmount, setPnlAmount] = useState<string>('2000');
  const [pnlPercent, setPnlPercent] = useState<string>('2');
  const [riskAmount, setRiskAmount] = useState<number>(1000);

  // Accounts
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accountId, setAccountId] = useState<string>('');

  // Setup templates + items
  const [templates, setTemplates] = useState<SetupTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>('');
  const [items, setItems] = useState<SetupItem[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  // Screenshot
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string>('');
  const beforePreviewUrlRef = useRef<string>('');

  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const hasAccounts = accounts.length > 0;

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

  useEffect(() => {
    return () => {
      if (beforePreviewUrlRef.current) {
        URL.revokeObjectURL(beforePreviewUrlRef.current);
        beforePreviewUrlRef.current = '';
      }
    };
  }, []);

  // Bootstrap: auth check + accounts + templates
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setMsg('');

      try {
        // accounts via service you already trust
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
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Load items when template changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!templateId) {
        setItems([]);
        setChecks({});
        return;
      }

      try {
        const list = await loadSetupItemsForTemplate(templateId);
        if (cancelled) return;

        setItems(list);
        const next: Record<string, boolean> = {};
        for (const it of list) next[it.id] = false;
        setChecks(next);
      } catch (e: unknown) {
        if (!cancelled) setMsg(getErr(e, 'Failed to load checklist items'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  function toggle(itemId: string) {
    setChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  const checkedCount = useMemo(
    () => Object.values(checks).filter(Boolean).length,
    [checks],
  );

  const checklistScore = useMemo(() => {
    const total = items.length;
    return total > 0 ? Math.round((checkedCount / total) * 100) : null;
  }, [checkedCount, items.length]);

  const rMultiple = useMemo(() => {
    if (!riskAmount || Number.isNaN(riskAmount)) return null;
    const amountNum = Number(pnlAmount);
    if (Number.isNaN(amountNum)) return null;
    return amountNum / riskAmount;
  }, [pnlAmount, riskAmount]);

  async function onSaveTrade(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (!accountId) {
      setMsg('Please create/select an account first.');
      return;
    }

    setSaving(true);
    setMsg('Saving...');

    try {
      await createTradeFlow({
        accountId,
        openedAtLocal: openedAt,
        instrument,
        direction,
        outcome,
        pnlAmountRaw: pnlAmount,
        pnlPercentRaw: pnlPercent,
        riskAmount,
        notes,
        templateId: templateId || null,
        items,
        checks,
        beforeFile,
      });

      setMsg('Saved');
      router.push('/dashboard');
    } catch (e: unknown) {
      setMsg(getErr(e, 'Failed to save trade'));
    } finally {
      setSaving(false);
    }
  }

  return {
    // accounts
    accounts,
    accountId,
    setAccountId,
    hasAccounts,

    // core fields
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
    rMultiple,

    // setups
    templates,
    templateId,
    setTemplateId,
    items,
    checks,
    toggle,
    checklistScore,

    // screenshot
    beforeFile,
    beforePreviewUrl,
    onBeforeFileChange,

    // notes + ui
    notes,
    setNotes,
    msg,
    saving,
    onSaveTrade,
  };
}