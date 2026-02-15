'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabaseClient';
import {
  createAccount,
  deleteAccount,
  fetchAccounts,
  setDefaultAccount,
  updateAccount,
  type Account,
} from '@/src/lib/accounts';
import { getErr } from '@/src/domain/errors';

function toNumberSafe(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toIsoCurrencyOrNull(input: string): string | null {
  const v = input.trim().toUpperCase();
  if (!v) return null;
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

export function useAccounts() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageMsg, setPageMsg] = useState('');

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addStartingBalance, setAddStartingBalance] = useState('0');
  const [addCurrency, setAddCurrency] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editStartingBalance, setEditStartingBalance] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editMsg, setEditMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  // Default action state
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const defaultAccountId = useMemo(
    () => accounts.find((a) => a.is_default)?.id ?? null,
    [accounts],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setPageMsg('');

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      if (!data?.user) {
        router.push('/auth');
        return;
      }

      const list = await fetchAccounts();
      setAccounts(list);
    } catch (e: unknown) {
      setPageMsg(getErr(e, 'Failed to load accounts'));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // --- Add modal helpers (standardize open/close) ---
  function openAdd() {
    setAddMsg('');
    setShowAdd(true);
  }

  function closeAdd() {
    if (creating) return;
    setShowAdd(false);
  }

  async function onAddAccount() {
    setAddMsg('');
    const name = addName.trim();
    if (!name) {
      setAddMsg('Account name is required.');
      return;
    }

    const sb = toNumberSafe(addStartingBalance);
    const currency = toIsoCurrencyOrNull(addCurrency);
    if (addCurrency.trim() && !currency) {
      setAddMsg('Currency must be a 3-letter code like USD, EUR, GBP.');
      return;
    }

    setCreating(true);
    try {
      const created = await createAccount({
        name,
        starting_balance: sb,
        base_currency: currency,
      });

      setAccounts((prev) => {
        const next = [...prev, created];
        if (created.is_default) {
          return next.map((a) => ({ ...a, is_default: a.id === created.id }));
        }
        return next;
      });

      setShowAdd(false);
      setAddName('');
      setAddStartingBalance('0');
      setAddCurrency('');
    } catch (e: unknown) {
      setAddMsg(getErr(e, 'Failed to create account'));
    } finally {
      setCreating(false);
    }
  }

  // --- Edit modal helpers ---
  function openEdit(a: Account) {
    setEditMsg('');
    setEditing(a);
    setEditName(a.name ?? '');
    setEditStartingBalance(String(a.starting_balance ?? 0));
    setEditCurrency(a.base_currency ?? '');
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  async function onSaveEdit() {
    if (!editing) return;
    setEditMsg('');

    const name = editName.trim();
    if (!name) {
      setEditMsg('Account name is required.');
      return;
    }

    const sb = toNumberSafe(editStartingBalance);
    const currency = toIsoCurrencyOrNull(editCurrency);
    if (editCurrency.trim() && !currency) {
      setEditMsg('Currency must be a 3-letter code like USD, EUR, GBP.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateAccount(editing.id, {
        name,
        starting_balance: sb,
        base_currency: currency,
      });

      setAccounts((prev) =>
        prev.map((a) => (a.id === updated.id ? updated : a)),
      );
      setEditing(null);
    } catch (e: unknown) {
      setEditMsg(getErr(e, 'Failed to update account'));
    } finally {
      setSaving(false);
    }
  }

  async function onSetDefault(id: string) {
    setPageMsg('');
    setSettingDefaultId(id);

    try {
      await setDefaultAccount(id);
      setAccounts((prev) =>
        prev.map((a) => ({ ...a, is_default: a.id === id })),
      );
      await reload();
    } catch (e: unknown) {
      setPageMsg(getErr(e, 'Failed to set default account'));
    } finally {
      setSettingDefaultId(null);
    }
  }

  // --- Delete modal helpers ---
  function requestDelete(a: Account) {
    setDeleteMsg('');
    setDeleteTarget(a);
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteMsg('');
    setDeleteTarget(null);
  }

  async function onConfirmDelete() {
    if (!deleteTarget) return;

    setDeleteMsg('');
    setDeleting(true);
    try {
      await deleteAccount(deleteTarget.id);
      setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setDeleteMsg(getErr(e, 'Failed to delete account'));
    } finally {
      setDeleting(false);
    }
  }

  return {
    // data
    accounts,
    loading,
    pageMsg,
    defaultAccountId,

    // add modal
    showAdd,
    addName,
    addStartingBalance,
    addCurrency,
    addMsg,
    creating,

    // edit modal
    editing,
    editName,
    editStartingBalance,
    editCurrency,
    editMsg,
    saving,

    // delete modal
    deleteTarget,
    deleting,
    deleteMsg,

    // default state
    settingDefaultId,

    // actions
    reload,

    openAdd,
    closeAdd,
    setAddName,
    setAddStartingBalance,
    setAddCurrency,
    onAddAccount,

    openEdit,
    closeEdit,
    setEditName,
    setEditStartingBalance,
    setEditCurrency,
    onSaveEdit,

    onSetDefault,

    requestDelete,
    closeDelete,
    onConfirmDelete,
  };
}