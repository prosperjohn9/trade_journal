'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import { getErr } from '@/src/domain/errors';
import type { Profile } from '@/src/domain/profile';
import { updateProfile } from '@/src/lib/db/profiles.repo';
import { toNumberSafe } from '@/src/lib/utils/number';
import {
  loadDashboard,
  removeTrade,
} from '@/src/lib/services/dashboard.service';

type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';
type Direction = 'BUY' | 'SELL';

export type TradeRow = {
  id: string;
  account_id: string;
  opened_at: string;
  instrument: string;
  direction: Direction;
  outcome: Outcome;
  pnl_amount: number;
  pnl_percent: number;
  commission: number | null;
  net_pnl: number | null;
  r_multiple: number | null;
  template_id: string | null;
  reviewed_at: string | null;
};

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  starting_balance: number;
  base_currency: string | null;
  is_default: boolean;
  created_at: string;
};

type UpdateProfileInput = { display_name: string | null };

function getDefaultMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function calcDisplayPnl(t: TradeRow): number {
  const gross = toNumberSafe(t.pnl_amount ?? 0, 0);

  if (!t.reviewed_at) return gross;

  const net = Number(t.net_pnl);
  if (Number.isFinite(net)) return net;

  const comm = toNumberSafe(t.commission ?? 0, 0);
  return gross - comm;
}

async function fetchChecklistScores(
  trades: Array<Pick<TradeRow, 'id' | 'template_id'>>,
): Promise<Record<string, number | null>> {
  const base: Record<string, number | null> = {};
  for (const t of trades) base[t.id] = null;

  if (!trades.length) return base;

  const tradeIds = trades.map((t) => t.id);
  const templateIds = Array.from(
    new Set(trades.map((t) => t.template_id).filter(Boolean)),
  ) as string[];

  if (!templateIds.length) return base;

  const { data: itemsData, error: itemsErr } = await supabase
    .from('setup_template_items')
    .select('id, template_id, is_active')
    .in('template_id', templateIds)
    .eq('is_active', true);

  if (itemsErr) throw itemsErr;

  const activeItems = (itemsData ?? []) as Array<{
    id: string;
    template_id: string;
  }>;

  const denomByTemplate: Record<string, number> = {};
  const activeItemIds = activeItems.map((i) => i.id);

  for (const it of activeItems) {
    denomByTemplate[it.template_id] =
      (denomByTemplate[it.template_id] || 0) + 1;
  }

  if (!activeItemIds.length) return base;

  const { data: checksData, error: checksErr } = await supabase
    .from('trade_criteria_checks')
    .select('trade_id, item_id, checked')
    .in('trade_id', tradeIds)
    .in('item_id', activeItemIds);

  if (checksErr) throw checksErr;

  const checks = (checksData ?? []) as Array<{
    trade_id: string;
    checked: boolean;
  }>;

  const checkedTrueByTrade: Record<string, number> = {};
  for (const row of checks) {
    if (row.checked) {
      checkedTrueByTrade[row.trade_id] =
        (checkedTrueByTrade[row.trade_id] || 0) + 1;
    }
  }

  const out: Record<string, number | null> = { ...base };
  const templateIdByTrade: Record<string, string | null> = {};
  for (const t of trades) templateIdByTrade[t.id] = t.template_id ?? null;

  for (const tradeId of tradeIds) {
    const tpl = templateIdByTrade[tradeId];
    if (!tpl) { out[tradeId] = null; continue; }
    const denom = denomByTemplate[tpl] || 0;
    if (!denom) { out[tradeId] = null; continue; }
    const num = checkedTrueByTrade[tradeId] || 0;
    out[tradeId] = (num / denom) * 100;
  }

  return out;
}

export function useDashboard() {
  const router = useRouter();

  const [month, setMonth] = useState(getDefaultMonth);
  const [accountId, setAccountId] = useState<string>('all');

  const dashKey = ['dashboard', month, accountId];

  const { data: dashData, error: dashError, isLoading } = useSWR(
    dashKey,
    () => loadDashboard({ month, accountId }),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const trades = dashData?.trades ?? [];

  const scoresKey = trades.length
    ? ['dashboard-scores', trades.map((t) => t.id).join(',')]
    : null;

  const { data: scoresData } = useSWR(
    scoresKey,
    () => fetchChecklistScores(trades.map((t) => ({ id: t.id, template_id: t.template_id }))),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const accounts = dashData?.accounts ?? [];

  // Normalize accountId when accounts change (e.g. selected account no longer exists)
  useEffect(() => {
    if (!accounts.length) return;
    setAccountId((prev) => {
      if (prev === 'all') return prev;
      if (accounts.some((a) => a.id === prev)) return prev;
      const def = accounts.find((a) => a.is_default) ?? accounts[0];
      return def?.id ?? 'all';
    });
  }, [accounts]);

  if (dashError) {
    const message = getErr(dashError, 'Failed to load dashboard');
    if (message.toLowerCase().includes('not authenticated')) {
      router.push('/auth');
    }
  }

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    if (dashData?.profile) {
      setProfile(dashData.profile);
      setDisplayNameDraft(dashData.profile.display_name ?? '');
    }
  }, [dashData?.profile]);

  const [deleteTradeTarget, setDeleteTradeTarget] = useState<TradeRow | null>(null);
  const [deletingTrade, setDeletingTrade] = useState(false);

  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const defaultAccountId = useMemo(
    () => accounts.find((a) => !!a.is_default)?.id ?? null,
    [accounts],
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  const allAccountsStartingBalance = useMemo(
    () => accounts.reduce((acc, a) => acc + toNumberSafe(a.starting_balance, 0), 0),
    [accounts],
  );

  type ProfileExtras = { base_currency?: string | null };
  const profileExtras = (profile ?? null) as unknown as ProfileExtras | null;
  const currency = profileExtras?.base_currency ?? 'USD';

  const hasStartingBalance =
    accountId === 'all'
      ? true
      : selectedAccount?.starting_balance !== null &&
        selectedAccount?.starting_balance !== undefined;

  const stats = useMemo(() => {
    const total = trades.length;
    const wins = trades.filter((t) => t.outcome === 'WIN').length;
    const losses = trades.filter((t) => t.outcome === 'LOSS').length;
    const be = trades.filter((t) => t.outcome === 'BREAKEVEN').length;

    const pnlDollar = trades.reduce((s, t) => s + calcDisplayPnl(t), 0);

    const commissionsPaid = trades.reduce((acc, t) => {
      const c = Number(t.commission ?? 0);
      return acc + (Number.isFinite(c) ? c : 0);
    }, 0);

    const winRate = total ? (wins / total) * 100 : 0;

    return { total, wins, losses, be, pnlDollar, winRate, commissionsPaid };
  }, [trades]);

  const priorPnlDollar = dashData?.priorPnlDollar ?? 0;

  const monthStartingBalance =
    accountId === 'all'
      ? allAccountsStartingBalance + priorPnlDollar
      : hasStartingBalance && selectedAccount
        ? toNumberSafe(selectedAccount.starting_balance, 0) + priorPnlDollar
        : null;

  const monthPnlPct = monthStartingBalance
    ? (stats.pnlDollar / monthStartingBalance) * 100
    : 0;

  const equity =
    monthStartingBalance === null ? null : monthStartingBalance + stats.pnlDollar;

  const displayName =
    profile?.display_name?.trim() || profile?.display_name || 'Trader';

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg('Saving...');

    try {
      const payload: UpdateProfileInput = {
        display_name: displayNameDraft.trim() || null,
      };
      const updated = await updateProfile(payload);
      setProfile(updated);
      setDisplayNameDraft(updated.display_name ?? '');
      setProfileMsg('Saved');
      setShowProfile(false);
    } catch (e: unknown) {
      setProfileMsg(getErr(e, 'Failed to save'));
    } finally {
      setSavingProfile(false);
      setTimeout(() => setProfileMsg(''), 2000);
    }
  }

  function requestDeleteTrade(t: TradeRow) {
    setDeleteTradeTarget(t);
  }

  async function confirmDeleteTrade() {
    if (!deleteTradeTarget) return;
    if (deletingTrade) return;

    setDeletingTrade(true);
    try {
      await removeTrade(deleteTradeTarget.id);
      setDeleteTradeTarget(null);
      // Invalidate cache so the dashboard reloads with the trade removed
      await mutate(dashKey);
    } catch (e: unknown) {
      alert(getErr(e, 'Failed to delete trade'));
    } finally {
      setDeletingTrade(false);
    }
  }

  function requestLogout() {
    setShowLogout(true);
  }

  async function confirmLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await supabase.auth.signOut();
      setShowLogout(false);
      router.push('/auth');
    } finally {
      setLoggingOut(false);
    }
  }

  return {
    loading: isLoading,
    msg: dashError ? getErr(dashError, 'Failed to load dashboard') : '',

    month,
    setMonth,

    accounts,
    accountId,
    setAccountId,
    defaultAccountId,
    selectedAccount,

    trades,
    checklistScoreByTrade: scoresData ?? {},

    profile,
    currency,
    displayName,
    displayNameDraft,
    setDisplayNameDraft,
    showProfile,
    setShowProfile,
    savingProfile,
    profileMsg,
    saveProfile,

    priorPnlDollar,
    loadingPriorPnl: isLoading,
    monthStartingBalance,
    monthPnlPct,
    equity,
    stats,

    deleteTradeTarget,
    deletingTrade,
    requestDeleteTrade,
    confirmDeleteTrade,
    setDeleteTradeTarget,

    showLogout,
    loggingOut,
    requestLogout,
    confirmLogout,
    setShowLogout,

    hasStartingBalance,
    calcDisplayPnl,
  };
}

export type DashboardState = ReturnType<typeof useDashboard>;
