import { requireUser } from '@/src/lib/supabase/auth';
import { toNumberSafe } from '@/src/lib/utils/number';
import type {
  Direction,
  Outcome,
  SetupTemplate,
} from '@/src/hooks/useNewTrade';
import { fetchSetupTemplates } from '@/src/lib/db/setupTemplates.repo';
import {
  createTradeRow,
  updateTradeBeforeScreenshotPath,
} from '@/src/lib/db/tradesWrite.repo';
import { uploadTradeBeforeScreenshot } from '@/src/lib/db/tradeScreenshots.repo';
import { supabase } from '@/src/lib/supabase/client';

export function getDefaultMonthDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export async function loadNewTradeBootstrap(): Promise<{
  templates: SetupTemplate[];
  defaultTemplateId: string;
}> {
  await requireUser();

  const templates = await fetchSetupTemplates();
  const def = templates.find((t) => t.is_default);
  const defaultTemplateId = def?.id ?? templates[0]?.id ?? '';

  return { templates, defaultTemplateId };
}

function normalizePnlByOutcome(params: {
  outcome: Outcome;
  pnlAmount: number;
  pnlPercent: number;
}): { pnl_amount: number; pnl_percent: number } {
  const { outcome, pnlAmount, pnlPercent } = params;

  if (outcome === 'LOSS') {
    return {
      pnl_amount: -Math.abs(pnlAmount),
      pnl_percent: -Math.abs(pnlPercent),
    };
  }

  if (outcome === 'WIN') {
    return {
      pnl_amount: Math.abs(pnlAmount),
      pnl_percent: Math.abs(pnlPercent),
    };
  }

  return { pnl_amount: pnlAmount, pnl_percent: pnlPercent };
}

export async function createTradeFlow(params: {
  accountId: string;
  openedAtLocal: string;

  instrument: string;
  direction: Direction;
  outcome: Outcome;

  pnlAmountRaw: string;
  pnlPercentRaw: string;
  riskAmount: number;

  notes: string;
  templateId: string | null;

  beforeFile: File | null;
}): Promise<void> {
  const user = await requireUser();

  const pnlAmountNum = Number(params.pnlAmountRaw);
  const pnlPercentNum = Number(params.pnlPercentRaw);

  if (!Number.isFinite(pnlAmountNum) || !Number.isFinite(pnlPercentNum)) {
    throw new Error('Please enter valid P&L values.');
  }

  const { pnl_amount, pnl_percent } = normalizePnlByOutcome({
    outcome: params.outcome,
    pnlAmount: pnlAmountNum,
    pnlPercent: pnlPercentNum,
  });

  const risk = toNumberSafe(params.riskAmount, 0);
  const r_multiple =
    risk > 0 && Number.isFinite(risk) ? pnl_amount / risk : null;

  const created = await createTradeRow({
    user_id: user.id,
    account_id: params.accountId,
    opened_at: new Date(params.openedAtLocal).toISOString(),
    instrument: params.instrument.trim().toUpperCase(),
    direction: params.direction,
    outcome: params.outcome,
    pnl_amount,
    pnl_percent,
    risk_amount: risk > 0 ? risk : null,
    r_multiple,
    notes: params.notes?.trim() ? params.notes.trim() : null,
    template_id: params.templateId,
  });

  const tradeId = created.id;

  if (params.beforeFile) {
    const path = await uploadTradeBeforeScreenshot({
      userId: user.id,
      tradeId,
      file: params.beforeFile,
    });

    await updateTradeBeforeScreenshotPath(tradeId, path);
  }
}

export type CopyTradeCopy = {
  accountId: string;
  accountStartingBalance: number;
  openedAtLocal: string;
  outcome: Outcome;
  pnlAmountRaw: string;
  riskAmount: number;
};

export async function createCopyTradeFlow(params: {
  shared: {
    instrument: string;
    direction: Direction;
    templateId: string | null;
    notes: string;
    beforeFile: File | null;
  };
  copies: CopyTradeCopy[];
}): Promise<{ groupId: string; tradeIds: string[] }> {
  const user = await requireUser();

  if (params.copies.length < 2) {
    throw new Error('A copy trade needs at least 2 accounts.');
  }

  const instrument = params.shared.instrument.trim().toUpperCase();
  if (!instrument) throw new Error('Instrument is required.');

  // Build the per-copy payloads. Each one normalizes its own P&L by outcome,
  // computes pnl_percent from its own account balance, and r-multiple from its
  // own risk.
  const copiesPayload = params.copies.map((c) => {
    const pnlAmountNum = Number(c.pnlAmountRaw);
    if (!Number.isFinite(pnlAmountNum)) {
      throw new Error(`Invalid P&L for one of the copies.`);
    }

    const { pnl_amount, pnl_percent } = (() => {
      const signed = normalizePnlByOutcome({
        outcome: c.outcome,
        pnlAmount: pnlAmountNum,
        pnlPercent:
          c.accountStartingBalance > 0
            ? (pnlAmountNum / c.accountStartingBalance) * 100
            : 0,
      });
      return signed;
    })();

    const risk = toNumberSafe(c.riskAmount, 0);
    const r_multiple =
      risk > 0 && Number.isFinite(risk) ? pnl_amount / risk : null;

    return {
      account_id: c.accountId,
      opened_at: new Date(c.openedAtLocal).toISOString(),
      outcome: c.outcome,
      pnl_amount,
      pnl_percent,
      risk_amount: risk > 0 ? risk : null,
      r_multiple,
    };
  });

  type CopyResp = { groupId: string; trades: Array<{ id: string; accountId: string }> };

  // 1. Create the group + N trades server-side (single round trip).
  const sessionRes = await supabase.auth.getSession();
  const token = sessionRes.data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const httpRes = await fetch('/api/trades/copy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      shared: {
        instrument,
        direction: params.shared.direction,
        template_id: params.shared.templateId,
        notes: params.shared.notes?.trim() ? params.shared.notes.trim() : null,
      },
      copies: copiesPayload,
    }),
  });

  if (!httpRes.ok) {
    const body = await httpRes.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create copy trade (${httpRes.status})`);
  }

  const data = (await httpRes.json()) as CopyResp;
  const groupId = data.groupId;
  const tradeIds = data.trades.map((t) => t.id);

  // 2. If there's a before-trade screenshot, upload it once using the first
  // trade ID as the path key, then attach that same path to every sibling row.
  if (params.shared.beforeFile && tradeIds.length > 0) {
    const path = await uploadTradeBeforeScreenshot({
      userId: user.id,
      tradeId: tradeIds[0],
      file: params.shared.beforeFile,
    });

    // Single update covers every sibling — RLS still applies per row.
    const { error } = await supabase
      .from('trades')
      .update({ before_screenshot_path: path })
      .eq('trade_group_id', groupId);

    if (error) throw error;
  }

  return { groupId, tradeIds };
}
