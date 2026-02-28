'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  normalizeAccountTag,
  normalizeAccountTags,
  normalizeAccountType,
  type Account,
  type AccountType,
} from '@/src/domain/account';
import { getErr } from '@/src/domain/errors';
import { toNumberSafe } from '@/src/lib/utils/number';
import { toIsoCurrencyOrNull } from '@/src/lib/utils/format';
import {
  createAccount,
  deleteAccount,
  listAccounts,
  setDefaultAccount,
  updateAccount,
} from '@/src/lib/services/accounts.service';

function parseBalanceInput(raw: string): number {
  const normalized = raw.replaceAll(',', '').replace(/[^\d.-]/g, '').trim();
  if (!normalized) return 0;
  return toNumberSafe(normalized, 0);
}

function formatBalanceInput(raw: number): string {
  if (!Number.isFinite(raw)) return '0';
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(raw);
}

const DEFAULT_ACCOUNT_TYPE: AccountType = 'Live';

function appendTag(tags: string[], raw: string): string[] {
  const normalized = normalizeAccountTag(raw);
  if (!normalized) return tags;
  return normalizeAccountTags([...tags, normalized]);
}

function removeTagAt(tags: string[], index: number): string[] {
  return tags.filter((_, i) => i !== index);
}

function finalizeDraftTags(tags: string[], inputValue: string): string[] {
  return normalizeAccountTags([...tags, inputValue]);
}

export function useAccounts() {
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageMsg, setPageMsg] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addAccountType, setAddAccountType] =
    useState<AccountType>(DEFAULT_ACCOUNT_TYPE);
  const [addTags, setAddTags] = useState<string[]>([]);
  const [addTagInput, setAddTagInput] = useState('');
  const [addStartingBalance, setAddStartingBalance] = useState('0');
  const [addCurrency, setAddCurrency] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editAccountType, setEditAccountType] =
    useState<AccountType>(DEFAULT_ACCOUNT_TYPE);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editStartingBalance, setEditStartingBalance] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editMsg, setEditMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const defaultAccountId = useMemo(
    () => accounts.find((a) => a.is_default)?.id ?? null,
    [accounts],
  );

  const allTagSuggestions = useMemo(
    () => normalizeAccountTags(accounts.flatMap((a) => a.tags ?? [])),
    [accounts],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setPageMsg('');

    try {
      const list = await listAccounts();
      setAccounts(list);
    } catch (e: unknown) {
      const message = getErr(e, 'Failed to load accounts');
      setPageMsg(message);
      setAccounts([]);

      if (message.toLowerCase().includes('not authenticated')) {
        router.push('/auth');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openAdd() {
    setAddMsg('');
    setAddName('');
    setAddAccountType(DEFAULT_ACCOUNT_TYPE);
    setAddTags([]);
    setAddTagInput('');
    setAddStartingBalance('0');
    setAddCurrency('');
    setShowAdd(true);
  }

  function closeAdd() {
    if (creating) return;
    setShowAdd(false);
  }

  function addTagToCreateDraft(raw: string) {
    setAddTags((prev) => appendTag(prev, raw));
    setAddTagInput('');
  }

  function removeCreateTag(index: number) {
    setAddTags((prev) => removeTagAt(prev, index));
  }

  async function onAddAccount() {
    setAddMsg('');

    const name = addName.trim();
    if (!name) {
      setAddMsg('Account name is required.');
      return;
    }

    const accountType = normalizeAccountType(addAccountType);
    const tags = finalizeDraftTags(addTags, addTagInput);
    const sb = parseBalanceInput(addStartingBalance);
    const currency = toIsoCurrencyOrNull(addCurrency);
    if (addCurrency.trim() && !currency) {
      setAddMsg('Currency must be a 3-letter code like USD, EUR, GBP.');
      return;
    }

    setCreating(true);
    try {
      const created = await createAccount({
        name,
        account_type: accountType,
        tags,
        starting_balance: sb,
        base_currency: currency,
      });
      const createdWithDraftTags: Account = { ...created, tags };

      setAccounts((prev) => {
        const next = [...prev, createdWithDraftTags];
        if (createdWithDraftTags.is_default) {
          return next.map((a) => ({
            ...a,
            is_default: a.id === createdWithDraftTags.id,
          }));
        }
        return next;
      });

      setShowAdd(false);
      setAddName('');
      setAddAccountType(DEFAULT_ACCOUNT_TYPE);
      setAddTags([]);
      setAddTagInput('');
      setAddStartingBalance('0');
      setAddCurrency('');
      await reload();
    } catch (e: unknown) {
      setAddMsg(getErr(e, 'Failed to create account'));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(a: Account) {
    setEditMsg('');
    setEditing(a);
    setEditName(a.name ?? '');
    setEditAccountType(normalizeAccountType(a.account_type));
    setEditTags(normalizeAccountTags(a.tags));
    setEditTagInput('');
    setEditStartingBalance(formatBalanceInput(a.starting_balance ?? 0));
    setEditCurrency(a.base_currency ?? '');
  }

  function closeEdit() {
    if (saving) return;
    setEditing(null);
  }

  function addTagToEditDraft(raw: string) {
    setEditTags((prev) => appendTag(prev, raw));
    setEditTagInput('');
  }

  function removeEditTag(index: number) {
    setEditTags((prev) => removeTagAt(prev, index));
  }

  async function onSaveEdit() {
    if (!editing) return;

    setEditMsg('');

    const name = editName.trim();
    if (!name) {
      setEditMsg('Account name is required.');
      return;
    }

    const accountType = normalizeAccountType(editAccountType);
    const tags = finalizeDraftTags(editTags, editTagInput);
    const sb = parseBalanceInput(editStartingBalance);
    const currency = toIsoCurrencyOrNull(editCurrency);
    if (editCurrency.trim() && !currency) {
      setEditMsg('Currency must be a 3-letter code like USD, EUR, GBP.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateAccount(editing.id, {
        name,
        account_type: accountType,
        tags,
        starting_balance: sb,
        base_currency: currency,
      });
      const updatedWithDraftTags: Account = { ...updated, tags };

      setAccounts((prev) =>
        prev.map((a) =>
          a.id === updatedWithDraftTags.id
            ? {
                ...updatedWithDraftTags,
                trade_count: a.trade_count ?? 0,
                net_pnl: a.net_pnl ?? 0,
              }
            : a,
        ),
      );
      setEditing(null);
      await reload();
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
    accounts,
    loading,
    pageMsg,
    defaultAccountId,

    showAdd,
    addName,
    addAccountType,
    addTags,
    addTagInput,
    addStartingBalance,
    addCurrency,
    addMsg,
    creating,

    editing,
    editName,
    editAccountType,
    editTags,
    editTagInput,
    editStartingBalance,
    editCurrency,
    editMsg,
    saving,

    deleteTarget,
    deleting,
    deleteMsg,

    settingDefaultId,
    allTagSuggestions,

    reload,

    openAdd,
    closeAdd,
    setAddName,
    setAddAccountType,
    setAddTagInput,
    addTagToCreateDraft,
    removeCreateTag,
    setAddStartingBalance,
    setAddCurrency,
    onAddAccount,

    openEdit,
    closeEdit,
    setEditName,
    setEditAccountType,
    setEditTagInput,
    addTagToEditDraft,
    removeEditTag,
    setEditStartingBalance,
    setEditCurrency,
    onSaveEdit,

    onSetDefault,

    requestDelete,
    closeDelete,
    onConfirmDelete,
  };
}
