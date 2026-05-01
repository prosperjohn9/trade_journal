import { requireUser } from '@/src/lib/supabase/auth';
import { getTradeById, fetchCumulativePnlBeforeDate } from '@/src/lib/db/trades.repo';
import { listTemplateItems } from '@/src/lib/db/setupTemplateItems.repo';
import { listTradeChecks } from '@/src/lib/db/tradeCriteriaChecks.repo';
import { signTradeScreenshotPath } from '@/src/lib/db/tradeScreenshots.repo';
import { fetchAccountByUserAndId } from '@/src/lib/db/accounts.repo';
import type { TradeChecklistItem, TradeView } from '@/src/hooks/useTradeView';

export async function loadTradeView(params: { tradeId: string }) {
  const user = await requireUser();

  const raw = await getTradeById(params.tradeId);
  const trade = raw as unknown as TradeView;

  if (trade.account_id && trade.account) {
    try {
      const account = await fetchAccountByUserAndId(user.id, trade.account_id);
      trade.account = {
        ...trade.account,
        tags: account.tags ?? [],
      };
    } catch {
      trade.account = {
        ...trade.account,
        tags: [],
      };
    }
  }

  const beforeUrl = trade.before_screenshot_path
    ? await signTradeScreenshotPath(trade.before_screenshot_path)
    : '';

  const afterUrl = trade.after_trade_screenshot_url
    ? await signTradeScreenshotPath(trade.after_trade_screenshot_url)
    : '';

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

  let equityBefore: number | null = null;
  const startingBalance = trade.account?.starting_balance ?? null;
  if (trade.account_id && startingBalance !== null) {
    const cumulativePnl = await fetchCumulativePnlBeforeDate({
      accountId: trade.account_id,
      beforeDate: trade.opened_at,
    });
    equityBefore = startingBalance + cumulativePnl;
  }

  return { trade, beforeUrl, afterUrl, items, checks, equityBefore };
}
