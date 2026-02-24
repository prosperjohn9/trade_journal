// src/lib/services/tradeReview.service.ts
import { requireUser } from '@/src/lib/supabase/auth';
import { toNumberSafe } from '@/src/lib/utils/number';

import { getTradeById } from '@/src/lib/db/trades.repo';
import {
  fetchSetupTemplates,
  type SetupTemplateRow,
} from '@/src/lib/db/setupTemplates.repo';
import {
  listTemplateItems,
  type SetupTemplateItemRow,
} from '@/src/lib/db/setupTemplateItems.repo';
import {
  listTradeChecks,
  upsertTradeCriteriaChecks,
} from '@/src/lib/db/tradeCriteriaChecks.repo';
import {
  signTradeScreenshotPath,
  uploadTradeAfterScreenshot,
} from '@/src/lib/db/tradeScreenshots.repo';
import { updateTradeReviewFields } from '@/src/lib/db/tradesWrite.repo';

export type TradeReviewRow = {
  id: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  opened_at: string;

  pnl_amount: number;
  pnl_percent: number;
  r_multiple: number | null;

  template_id: string | null;
  reviewed_at: string | null;

  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  exit_price: number | null;
  closed_at: string | null;
  commission: number | null;
  net_pnl: number | null;

  emotion_tag: string | null;
  lesson_learned: string | null;
  review_notes: string | null;

  after_trade_screenshot_url: string | null;
};

export function toLocalDatetimeValue(dateIso: string | null) {
  if (!dateIso) return '';
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function safeNum(v: string): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function pickDefaultTemplateId(templates: SetupTemplateRow[]) {
  const def = templates.find((t) => t.is_default);
  return def?.id ?? templates[0]?.id ?? '';
}

export { signTradeScreenshotPath };

export async function loadTradeReviewBootstrap(params: {
  tradeId: string;
}): Promise<{
  trade: TradeReviewRow;
  templates: SetupTemplateRow[];
  templateId: string;
  items: SetupTemplateItemRow[];
  checks: Record<string, boolean>;
}> {
  await requireUser();

  const raw = await getTradeById(params.tradeId);
  const trade = raw as unknown as TradeReviewRow;

  const templates = await fetchSetupTemplates();
  const templateId = trade.template_id ?? pickDefaultTemplateId(templates);

  const checklist = await loadTradeReviewChecklist({
    tradeId: trade.id,
    templateId,
  });

  return {
    trade,
    templates,
    templateId,
    items: checklist.items,
    checks: checklist.checks,
  };
}

export async function loadTradeReviewChecklist(params: {
  tradeId: string;
  templateId: string;
}): Promise<{
  items: SetupTemplateItemRow[];
  checks: Record<string, boolean>;
}> {
  await requireUser();

  if (!params.templateId) return { items: [], checks: {} };

  // listTemplateItems includes is_active, needed for the review UI
  const items = await listTemplateItems(params.templateId);
  const itemIds = items.map((i) => i.id);

  if (!itemIds.length) return { items, checks: {} };

  const saved = await listTradeChecks({ tradeId: params.tradeId, itemIds });

  // default TRUE for review UI, then override with saved values
  const checks: Record<string, boolean> = {};
  for (const id of itemIds) checks[id] = true;
  for (const row of saved) checks[row.item_id] = !!row.checked;

  return { items, checks };
}

export async function saveTradeReviewFlow(params: {
  tradeId: string;
  templateId: string | null;

  pnlAmount: number;

  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  exitPrice: string;
  closedAtLocal: string;
  commissionRaw: string;

  emotionTag: string;
  lessonLearned: string;
  reviewNotes: string;

  activeItems: Array<{ id: string }>;
  checks: Record<string, boolean>;

  afterFile: File | null;
}): Promise<void> {
  const user = await requireUser();

  const commission = toNumberSafe(params.commissionRaw, 0);
  const netPnl = (Number(params.pnlAmount) || 0) - commission;

  let afterPath: string | undefined;
  if (params.afterFile) {
    afterPath = await uploadTradeAfterScreenshot({
      userId: user.id,
      tradeId: params.tradeId,
      file: params.afterFile,
    });
  }

  await updateTradeReviewFields(params.tradeId, {
    template_id: params.templateId, // ✅ now supported by the repo typing
    entry_price: safeNum(params.entryPrice),
    stop_loss: safeNum(params.stopLoss),
    take_profit: safeNum(params.takeProfit),
    exit_price: safeNum(params.exitPrice),
    closed_at: params.closedAtLocal
      ? new Date(params.closedAtLocal).toISOString()
      : null,
    commission,
    net_pnl: netPnl,
    emotion_tag: params.emotionTag.trim() || null,
    lesson_learned: params.lessonLearned.trim() || null,
    review_notes: params.reviewNotes.trim() || null,
    ...(afterPath ? { after_trade_screenshot_url: afterPath } : {}),
    reviewed_at: new Date().toISOString(),
  });

  const rows = params.activeItems.map((it) => ({
    trade_id: params.tradeId,
    item_id: it.id,
    checked: !!params.checks[it.id],
  }));

  await upsertTradeCriteriaChecks(rows);
}