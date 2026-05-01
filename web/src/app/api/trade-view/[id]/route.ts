import { NextResponse } from 'next/server';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

const TRADE_VIEW_SELECT = `
  id, opened_at,
  instrument, direction, outcome,
  pnl_amount, pnl_percent, risk_amount, r_multiple,
  account_id,
  account:accounts(id, name, account_type, base_currency, starting_balance),
  template_id, notes, reviewed_at,
  entry_price, stop_loss, take_profit, exit_price, closed_at, commission, net_pnl,
  emotion_tag, lesson_learned, review_notes,
  before_screenshot_path, after_trade_screenshot_url
`;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);

  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tradeId } = await params;

  // Fetch the trade with its account
  const { data: tradeRaw, error: tradeErr } = await sb
    .from('trades')
    .select(TRADE_VIEW_SELECT)
    .eq('id', tradeId)
    .single();

  if (tradeErr) return NextResponse.json({ error: tradeErr.message }, { status: tradeErr.code === 'PGRST116' ? 404 : 500 });

  const trade = tradeRaw as Record<string, unknown>;
  const account = trade.account as { id: string; name: string; account_type?: string | null; base_currency?: string | null; starting_balance?: number | null } | null;
  const startingBalance = account?.starting_balance ?? null;

  // Run all independent lookups in parallel
  const [accountTagsRes, beforeSignRes, afterSignRes, itemsRes, cumulativePnlData] =
    await Promise.all([
      // Get account tags from the view (main query joins to accounts, not accounts_with_tags)
      trade.account_id && account
        ? sb.from('accounts_with_tags').select('tags').eq('id', trade.account_id).eq('user_id', user.id).single()
        : Promise.resolve(null),

      // Sign before screenshot
      trade.before_screenshot_path
        ? sb.storage.from('trade-screenshots').createSignedUrl(String(trade.before_screenshot_path), 600)
        : Promise.resolve(null),

      // Sign after screenshot
      trade.after_trade_screenshot_url
        ? sb.storage.from('trade-screenshots').createSignedUrl(String(trade.after_trade_screenshot_url), 600)
        : Promise.resolve(null),

      // Template checklist items
      trade.template_id
        ? sb.from('setup_template_items').select('id, label, sort_order, is_active').eq('template_id', trade.template_id).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
        : Promise.resolve(null),

      // Cumulative P&L for equity-before calculation
      trade.account_id && startingBalance !== null
        ? sb.rpc('get_cumulative_pnl_before_date', {
            p_account_id: trade.account_id,
            p_before_date: trade.opened_at,
          })
        : Promise.resolve(null),
    ]);

  // Merge tags onto the account object
  const tags =
    accountTagsRes && 'data' in accountTagsRes && accountTagsRes.data
      ? ((accountTagsRes.data as { tags?: unknown }).tags as string[] | null) ?? []
      : [];

  const enrichedTrade = {
    ...trade,
    account: account ? { ...account, tags } : null,
  };

  const beforeUrl =
    beforeSignRes && 'data' in beforeSignRes && beforeSignRes.data?.signedUrl
      ? beforeSignRes.data.signedUrl
      : '';

  const afterUrl =
    afterSignRes && 'data' in afterSignRes && afterSignRes.data?.signedUrl
      ? afterSignRes.data.signedUrl
      : '';

  const items = itemsRes && 'data' in itemsRes && itemsRes.data ? itemsRes.data : [];
  const itemIds = (items as Array<{ id: string }>).map((i) => i.id);

  // Fetch checklist checks (needs itemIds from items — sequential)
  let checks: Record<string, boolean> = {};
  if (itemIds.length) {
    for (const id of itemIds) checks[id] = false;
    const { data: checksData } = await sb
      .from('trade_criteria_checks')
      .select('item_id, checked')
      .eq('trade_id', tradeId)
      .in('item_id', itemIds);

    for (const r of (checksData ?? []) as Array<{ item_id: string; checked: boolean }>) {
      checks[r.item_id] = !!r.checked;
    }
  }

  const cumulativePnl =
    cumulativePnlData && 'data' in cumulativePnlData && cumulativePnlData.data != null
      ? Number(cumulativePnlData.data)
      : null;

  const equityBefore =
    cumulativePnl !== null && startingBalance !== null
      ? startingBalance + cumulativePnl
      : null;

  return NextResponse.json(
    { trade: enrichedTrade, beforeUrl, afterUrl, items, checks, equityBefore },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=10' } },
  );
}
