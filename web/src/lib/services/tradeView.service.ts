import { requireUser } from '@/src/lib/supabase/auth';
import { getTradeById } from '@/src/lib/db/trades.repo';
import { listTemplateItems } from '@/src/lib/db/setupTemplateItems.repo';
import { listTradeChecks } from '@/src/lib/db/tradeCriteriaChecks.repo';
import { signTradeScreenshotPath } from '@/src/lib/db/tradeScreenshots.repo';
import type { TradeChecklistItem, TradeView } from '@/src/hooks/useTradeView';

export async function loadTradeView(params: { tradeId: string }) {
  await requireUser();

  const raw = await getTradeById(params.tradeId);
  const trade = raw as unknown as TradeView;

  // signed screenshot urls
  const beforeUrl = trade.before_screenshot_path
    ? await signTradeScreenshotPath(trade.before_screenshot_path)
    : '';

  const afterUrl = trade.after_trade_screenshot_url
    ? await signTradeScreenshotPath(trade.after_trade_screenshot_url)
    : '';

  // checklist
  let items: TradeChecklistItem[] = [];
  let checks: Record<string, boolean> = {};

  if (trade.template_id) {
    items = (await listTemplateItems(
      trade.template_id,
    )) as TradeChecklistItem[];

    const itemIds = items.map((i) => i.id);
    checks = {};
    for (const it of items) checks[it.id] = false;

    if (itemIds.length) {
      const rows = await listTradeChecks({ tradeId: trade.id, itemIds });

      for (const r of rows) {
        checks[r.item_id] = !!r.checked;
      }
    }
  }

  return { trade, beforeUrl, afterUrl, items, checks };
}