import { requireUser } from '@/src/lib/supabase/auth';
import { toNumberSafe } from '@/src/lib/utils/number';
import type {
  Direction,
  Outcome,
  SetupItem,
  SetupTemplate,
} from '@/src/hooks/useNewTrade';
import { fetchSetupTemplates } from '@/src/lib/db/setupTemplates.repo';
import { fetchActiveSetupItemsByTemplate } from '@/src/lib/db/setupTemplateItems.repo';
import {
  createTradeRow,
  updateTradeBeforeScreenshotPath,
} from '@/src/lib/db/tradesWrite.repo';
import { upsertTradeCriteriaChecks } from '@/src/lib/db/tradeCriteriaChecks.repo';
import { uploadTradeBeforeScreenshot } from '@/src/lib/db/tradeScreenshots.repo';

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

export async function loadSetupItemsForTemplate(
  templateId: string,
): Promise<SetupItem[]> {
  await requireUser();
  return fetchActiveSetupItemsByTemplate(templateId);
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

  items: SetupItem[];
  checks: Record<string, boolean>;

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

  if (params.templateId && params.items.length) {
    const payload = params.items.map((it) => ({
      trade_id: tradeId,
      item_id: it.id,
      checked: !!params.checks[it.id],
    }));

    await upsertTradeCriteriaChecks(payload);
  }

  if (params.beforeFile) {
    const path = await uploadTradeBeforeScreenshot({
      userId: user.id,
      tradeId,
      file: params.beforeFile,
    });

    await updateTradeBeforeScreenshotPath(tradeId, path);
  }
}