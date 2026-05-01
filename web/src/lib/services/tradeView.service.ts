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

  const startingBalance = trade.account?.starting_balance ?? null;

  // All of these are independent of each other — run in parallel
  const [accountResult, beforeUrl, afterUrl, rawItems, cumulativePnl] =
    await Promise.all([
      trade.account_id && trade.account
        ? fetchAccountByUserAndId(user.id, trade.account_id).catch(() => null)
        : Promise.resolve(null),
      trade.before_screenshot_path
        ? signTradeScreenshotPath(trade.before_screenshot_path)
        : Promise.resolve(''),
      trade.after_trade_screenshot_url
        ? signTradeScreenshotPath(trade.after_trade_screenshot_url)
        : Promise.resolve(''),
      trade.template_id
        ? (listTemplateItems(trade.template_id) as Promise<TradeChecklistItem[]>)
        : Promise.resolve([] as TradeChecklistItem[]),
      trade.account_id && startingBalance !== null
        ? fetchCumulativePnlBeforeDate({
            accountId: trade.account_id,
            beforeDate: trade.opened_at,
          })
        : Promise.resolve(null),
    ]);

  if (accountResult && trade.account) {
    trade.account = { ...trade.account, tags: accountResult.tags ?? [] };
  } else if (trade.account) {
    trade.account = { ...trade.account, tags: [] };
  }

  const items = rawItems;
  let checks: Record<string, boolean> = {};

  if (items.length) {
    const itemIds = items.map((i) => i.id);
    for (const it of items) checks[it.id] = false;
    const rows = await listTradeChecks({ tradeId: trade.id, itemIds });
    for (const r of rows) checks[r.item_id] = !!r.checked;
  }

  const equityBefore =
    cumulativePnl !== null && startingBalance !== null
      ? startingBalance + cumulativePnl
      : null;

  return { trade, beforeUrl, afterUrl, items, checks, equityBefore };
}
