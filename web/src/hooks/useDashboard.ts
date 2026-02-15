'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabaseClient';
import {
  getOrCreateProfile,
  updateProfile,
  type Profile,
} from '@/src/lib/profile';
import {
  deleteTradeById,
  fetchChecklistScores,
  fetchDashboardAccounts,
  fetchPriorPnl,
  fetchTradesForMonth,
  type AccountRow,
  type TradeRow,
} from '@/src/lib/dashboard';
import { getErr } from '@/src/domain/errors';

type UpdateProfileInput = {
  display_name: string | null;
};

function toNumberSafe(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useDashboard() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountId, setAccountId] = useState<string>('all');

  const [trades, setTrades] = useState<TradeRow[]>([]);

  const [priorPnlDollar, setPriorPnlDollar] = useState(0);
  const [loadingPriorPnl, setLoadingPriorPnl] = useState(false);

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [checklistScoreByTrade, setChecklistScoreByTrade] = useState<
    Record<string, number | null>
  >({});

  // Delete confirmation modal state.
  const [deleteTradeTarget, setDeleteTradeTarget] = useState<TradeRow | null>(
    null,
  );
  const [deletingTrade, setDeletingTrade] = useState(false);

  // Logout confirmation modal state.
  const [showLogout, setShowLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Some fields may not be present on generated Profile type.
  type ProfileExtras = { base_currency?: string | null };
  const profileExtras = (profile ?? null) as unknown as ProfileExtras | null;
  const currency = profileExtras?.base_currency ?? 'USD';

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? null,
    [accounts, accountId],
  );

  const startingBalanceRaw = selectedAccount?.starting_balance;
  const hasStartingBalance =
    startingBalanceRaw !== null && startingBalanceRaw !== undefined;

  const startingBalance = hasStartingBalance
    ? toNumberSafe(startingBalanceRaw)
    : 0;

  const defaultAccountId = useMemo(
    () => accounts.find((a) => !!a.is_default)?.id ?? null,
    [accounts],
  );

  const allAccountsStartingBalance = useMemo(
    () =>
      accounts.reduce((acc, a) => acc + toNumberSafe(a.starting_balance), 0),
    [accounts],
  );

  // --- Auth + profile ---
  useEffect(() => {
    (async () => {
      try {
        const { profile, user } = await getOrCreateProfile();
        if (!user) {
          router.push('/auth');
          return;
        }
        setUserId(user.id);
        setProfile(profile);
        setDisplayNameDraft(profile?.display_name ?? '');
      } catch (e: unknown) {
        console.error(e);
        router.push('/auth');
      }
    })();
  }, [router]);

  // --- Accounts ---
  useEffect(() => {
    (async () => {
      if (!userId) return;

      try {
        const rows = await fetchDashboardAccounts(userId);
        setAccounts(rows);

        // default selection: keep if valid, else default account, else first
        if (rows.length) {
          const def = rows.find((a) => !!a.is_default) ?? rows[0];

          setAccountId((prev) => {
            if (prev === 'all') return prev;
            if (rows.some((a) => a.id === prev)) return prev;
            return def.id;
          });
        }
      } catch (e: unknown) {
        console.error(e);
        setAccounts([]);
      }
    })();
  }, [userId]);

  // --- Trades (selected month) ---
  useEffect(() => {
    (async () => {
      try {
        const list = await fetchTradesForMonth({ month, accountId });
        setTrades(list);
      } catch (e: unknown) {
        console.error(e);
        setTrades([]);
      }
    })();
  }, [month, accountId]);

  // --- Prior P&L (before selected month) ---
  useEffect(() => {
    (async () => {
      const canCompute = accountId === 'all' ? true : hasStartingBalance;

      if (!canCompute) {
        setPriorPnlDollar(0);
        return;
      }

      setLoadingPriorPnl(true);
      try {
        const sum = await fetchPriorPnl({ month, accountId });
        setPriorPnlDollar(sum);
      } catch (e: unknown) {
        console.error(e);
        setPriorPnlDollar(0);
      } finally {
        setLoadingPriorPnl(false);
      }
    })();
  }, [month, accountId, hasStartingBalance]);

  // --- Checklist scores ---
  useEffect(() => {
    (async () => {
      setChecklistScoreByTrade({});
      try {
        const scores = await fetchChecklistScores(
          trades.map((t) => ({ id: t.id, template_id: t.template_id })),
        );
        setChecklistScoreByTrade(scores);
      } catch (e: unknown) {
        console.error(e);
        const base: Record<string, number | null> = {};
        for (const t of trades) base[t.id] = null;
        setChecklistScoreByTrade(base);
      }
    })();
  }, [trades]);

  // --- P&L display logic (same rule you had) ---
  function calcDisplayPnl(t: TradeRow): number {
    const gross = toNumberSafe(t.pnl_amount ?? 0);

    if (!t.reviewed_at) return gross;

    const net = Number(t.net_pnl);
    if (Number.isFinite(net)) return net;

    const comm = toNumberSafe(t.commission ?? 0);
    return gross - comm;
  }

  // --- Summary stats (NET based) ---
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

  // Month starting balance:
  const monthStartingBalance =
    accountId === 'all'
      ? allAccountsStartingBalance + priorPnlDollar
      : hasStartingBalance
        ? startingBalance + priorPnlDollar
        : null;

  const monthPnlPct = monthStartingBalance
    ? (stats.pnlDollar / monthStartingBalance) * 100
    : 0;

  const equity =
    monthStartingBalance === null
      ? null
      : monthStartingBalance + stats.pnlDollar;

  const displayName =
    profile?.display_name?.trim() || profile?.display_name || 'Trader';

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg('Saving...');

    try {
      const payload: UpdateProfileInput = {
        display_name: displayNameDraft.trim() || null,
      };

      const updated = await updateProfile(
        payload as unknown as Partial<Profile>,
      );
      setProfile(updated);
      setDisplayNameDraft(updated.display_name ?? '');

      setProfileMsg('Saved');
      setShowProfile(false);
    } catch (e: unknown) {
      console.error(e);
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
      await deleteTradeById(deleteTradeTarget.id);
      setTrades((prev) => prev.filter((t) => t.id !== deleteTradeTarget.id));
      setDeleteTradeTarget(null);
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
    // state
    accounts,
    accountId,
    setAccountId,
    defaultAccountId,
    selectedAccount,

    trades,
    checklistScoreByTrade,

    month,
    setMonth,

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
    loadingPriorPnl,
    monthStartingBalance,
    monthPnlPct,
    equity,
    stats,

    // delete trade modal
    deleteTradeTarget,
    deletingTrade,
    requestDeleteTrade,
    confirmDeleteTrade,
    setDeleteTradeTarget,

    // logout modal
    showLogout,
    loggingOut,
    requestLogout,
    confirmLogout,
    setShowLogout,

    // helpers
    hasStartingBalance,
    calcDisplayPnl,
  };
}