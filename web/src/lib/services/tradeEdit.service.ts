import { requireUser } from '@/src/lib/supabase/auth';
import { toNumberSafe } from '@/src/lib/utils/number';

import { getTradeById } from '@/src/lib/db/trades.repo';
import { fetchSetupTemplates } from '@/src/lib/db/setupTemplates.repo';
import {
  listTemplateItems,
  type SetupItemWithActiveRow,
} from '@/src/lib/db/setupTemplateItems.repo';
import {
  listTradeChecks,
} from '@/src/lib/db/tradeCriteriaChecks.repo';
import {
  signTradeScreenshotPath,
  uploadTradeBeforeScreenshot,
  uploadTradeAfterScreenshot,
} from '@/src/lib/db/tradeScreenshots.repo';

import {
  updateTradeEntryFields,
  updateTradeReviewFields,
  updateTradeScreenshotPaths,
} from '@/src/lib/db/tradesWrite.repo';

export type Direction = 'BUY' | 'SELL';
export type Outcome = 'WIN' | 'LOSS' | 'BREAKEVEN';

export type TradeEditRow = {
  id: string;
  opened_at: string;
  account_id: string | null;
  instrument: string | null;
  direction: Direction | null;
  outcome: Outcome | null;

  pnl_amount: number | null;
  pnl_percent: number | null;
  risk_amount: number | null;
  r_multiple: number | null;
  notes: string | null;

  template_id: string | null;

  before_screenshot_path: string | null;

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

export function toDatetimeLocalValue(dateIso: string) {
  const d = new Date(dateIso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function safeNum(v: string): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function normalizePnl(outcome: Outcome, pnlAmount: number, pnlPercent: number) {
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

export async function loadTradeEditBootstrap(params: { tradeId: string }) {
  await requireUser();

  const raw = await getTradeById(params.tradeId);
  const trade = raw as TradeEditRow;

  const templateId = trade.template_id;

  const checklist = templateId
    ? await loadTradeEditChecklist({ tradeId: trade.id, templateId })
    : { items: [], checks: {} };

  const beforeSignedUrl = trade.before_screenshot_path
    ? await signTradeScreenshotPath(trade.before_screenshot_path)
    : '';

  const afterSignedUrl = trade.after_trade_screenshot_url
    ? await signTradeScreenshotPath(trade.after_trade_screenshot_url)
    : '';

  return {
    trade,
    templateId,
    items: checklist.items,
    checks: checklist.checks,
    beforeSignedUrl,
    afterSignedUrl,
  };
}

export async function loadTradeEditTemplates() {
  await requireUser();
  return fetchSetupTemplates();
}

export async function loadTradeEditChecklist(params: {
  tradeId: string;
  templateId: string;
}): Promise<{
  items: SetupItemWithActiveRow[];
  checks: Record<string, boolean>;
}> {
  await requireUser();

  const items = await listTemplateItems(params.templateId);
  const itemIds = items.map((i) => i.id);
  if (!itemIds.length) return { items, checks: {} };

  const saved = await listTradeChecks({ tradeId: params.tradeId, itemIds });

  const checks: Record<string, boolean> = {};
  for (const id of itemIds) checks[id] = false;
  for (const row of saved) checks[row.item_id] = !!row.checked;

  return { items, checks };
}

export async function saveTradeEntryFlow(params: {
  tradeId: string;
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
  afterFile: File | null;
  resetReview: boolean;
}): Promise<{
  beforePath: string | null;
  afterPath: string | null;
  beforeSignedUrl?: string;
  afterSignedUrl?: string;
}> {
  const user = await requireUser();

  const pnlAmountNum = Number(params.pnlAmountRaw);
  const pnlPercentNum = Number(params.pnlPercentRaw);
  if (!params.accountId) {
    throw new Error('Please select an account first.');
  }

  if (!Number.isFinite(pnlAmountNum) || !Number.isFinite(pnlPercentNum)) {
    throw new Error('Please enter valid P&L values.');
  }

  const { pnl_amount, pnl_percent } = normalizePnl(
    params.outcome,
    pnlAmountNum,
    pnlPercentNum,
  );

  const risk = toNumberSafe(params.riskAmount, 0);
  const r_multiple = risk && Number.isFinite(risk) ? pnl_amount / risk : null;

  let beforePath: string | null = null;
  let afterPath: string | null = null;
  let beforeSignedUrl: string | undefined = undefined;
  let afterSignedUrl: string | undefined = undefined;

  if (params.beforeFile) {
    beforePath = await uploadTradeBeforeScreenshot({
      userId: user.id,
      tradeId: params.tradeId,
      file: params.beforeFile,
    });

    // optional immediate preview refresh
    beforeSignedUrl = beforePath
      ? await signTradeScreenshotPath(beforePath)
      : '';
  }

  if (params.afterFile) {
    afterPath = await uploadTradeAfterScreenshot({
      userId: user.id,
      tradeId: params.tradeId,
      file: params.afterFile,
    });

    afterSignedUrl = afterPath
      ? await signTradeScreenshotPath(afterPath)
      : '';
  }

  await updateTradeEntryFields(params.tradeId, {
    account_id: params.accountId,
    opened_at: new Date(params.openedAtLocal).toISOString(),
    instrument: params.instrument,
    direction: params.direction,
    outcome: params.outcome,
    pnl_amount,
    pnl_percent,
    risk_amount: risk || null,
    r_multiple,
    notes: params.notes?.trim() ? params.notes.trim() : null,
    template_id: params.templateId,
  });

  if (params.resetReview) {
    await updateTradeReviewFields(params.tradeId, {
      reviewed_at: null,
    });
  }

  if (beforePath) {
    await updateTradeScreenshotPaths(params.tradeId, {
      before_screenshot_path: beforePath,
    });
  }

  if (afterPath) {
    await updateTradeScreenshotPaths(params.tradeId, {
      after_trade_screenshot_url: afterPath,
    });
  }

  return {
    beforePath,
    afterPath,
    ...(beforeSignedUrl ? { beforeSignedUrl } : {}),
    ...(afterSignedUrl ? { afterSignedUrl } : {}),
  };
}

export async function saveTradeReviewFlow(params: {
  tradeId: string;
  pnlAmount: number;

  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  exitPrice: string;
  closedAtLocal: string;

  commissionRaw: string;
  netPnlRaw: string;

  emotionTag: string;
  lessonLearned: string;
  reviewNotes: string;

  afterFile: File | null;
  reviewedAtExisting: string | null;
}): Promise<{
  afterPath: string | null;
  afterSignedUrl?: string;
  reviewedAt: string;
}> {
  const user = await requireUser();

  const commission = toNumberSafe(params.commissionRaw, 0);

  const explicitNet = safeNum(params.netPnlRaw);
  const autoNet = (Number(params.pnlAmount) || 0) - commission;
  const net_pnl = explicitNet !== null ? explicitNet : autoNet;

  let afterPath: string | null = null;
  let afterSignedUrl: string | undefined = undefined;

  if (params.afterFile) {
    afterPath = await uploadTradeAfterScreenshot({
      userId: user.id,
      tradeId: params.tradeId,
      file: params.afterFile,
    });

    afterSignedUrl = afterPath ? await signTradeScreenshotPath(afterPath) : '';
  }

  const nowIso = new Date().toISOString();
  const reviewed_at = params.reviewedAtExisting ?? nowIso;

  await updateTradeReviewFields(params.tradeId, {
    reviewed_at,
    entry_price: safeNum(params.entryPrice),
    stop_loss: safeNum(params.stopLoss),
    take_profit: safeNum(params.takeProfit),
    exit_price: safeNum(params.exitPrice),
    closed_at: params.closedAtLocal
      ? new Date(params.closedAtLocal).toISOString()
      : null,
    commission,
    net_pnl,
    emotion_tag: params.emotionTag.trim() || null,
    lesson_learned: params.lessonLearned.trim() || null,
    review_notes: params.reviewNotes.trim() || null,
    ...(afterPath ? { after_trade_screenshot_url: afterPath } : {}),
  });

  if (afterPath) {
    await updateTradeScreenshotPaths(params.tradeId, {
      after_trade_screenshot_url: afterPath,
    });
  }

  return {
    afterPath,
    reviewedAt: reviewed_at,
    ...(afterSignedUrl ? { afterSignedUrl } : {}),
  };
}
