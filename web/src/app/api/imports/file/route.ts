import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';
import {
  parseCsv,
  parseMt5Html,
  parseTabular,
  rowHash,
  type ParseOutcome,
  type ParsedTrade,
} from '@/src/lib/imports/parse';

export const runtime = 'nodejs';
export const maxDuration = 60;

// POST /api/imports/file (multipart/form-data: file, accountId)
//
// Statement import: MT5 HTML report, or CSV/XLSX from any platform (cTrader,
// TradeLocker, DXtrade, MatchTrader, ...). Free on every plan — parsing costs
// us nothing and this is the funnel for traders we can't auto-sync. Dedup via
// a stable content hash, so re-uploading the same statement is idempotent.

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB is generous for any statement

function toRow(t: ParsedTrade, ctx: { userId: string; accountId: string }) {
  const net = t.grossProfit - t.costs;
  // MT5 reports carry the broker position id — the same id MetaApi auto-sync
  // uses — so statement uploads dedupe against previously synced trades
  // instead of duplicating them.
  const externalId = t.positionId
    ? `metaapi:${t.positionId}`
    : `import:${rowHash([
        t.instrument,
        t.opened_at,
        t.closed_at,
        t.volume,
        t.grossProfit,
      ])}`;
  return {
    user_id: ctx.userId,
    account_id: ctx.accountId,
    external_id: externalId,
    import_source: 'file',
    instrument: t.instrument,
    direction: t.direction,
    outcome: net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN',
    opened_at: t.opened_at,
    closed_at: t.closed_at,
    entry_price: t.entry_price,
    exit_price: t.exit_price,
    stop_loss: t.stop_loss,
    take_profit: t.take_profit,
    volume: t.volume,
    pnl_amount: t.grossProfit,
    pnl_percent: 0,
    net_pnl: net,
    commission: t.costs,
    risk_amount: null,
    r_multiple: null,
  };
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 });
  }
  const file = form.get('file');
  const accountId = String(form.get('accountId') ?? '');
  if (!(file instanceof File) || !accountId) {
    return NextResponse.json(
      { error: 'A file and accountId are required.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 8 MB).' }, { status: 400 });
  }

  // RLS-backed ownership check on the target account.
  const { data: account } = await sb
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) {
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  const name = file.name.toLowerCase();
  let outcome: ParseOutcome;
  try {
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true,
      });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
        header: 1,
        raw: true,
      });
      outcome = parseTabular(rows);
    } else {
      const text = await file.text();
      const looksHtml = /<\s*(html|table|tr)[\s>]/i.test(text.slice(0, 4000));
      if (name.endsWith('.html') || name.endsWith('.htm') || looksHtml) {
        outcome = parseMt5Html(text);
      } else {
        outcome = parseTabular(parseCsv(text));
      }
    }
  } catch (e) {
    console.error('Import parse failed', e);
    return NextResponse.json(
      { error: 'Could not read that file. Is it a valid statement export?' },
      { status: 400 },
    );
  }

  if (outcome.error) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }
  if (!outcome.trades.length) {
    return NextResponse.json({ error: 'No trades found in the file.' }, { status: 400 });
  }

  const rows = outcome.trades.map((t) => toRow(t, { userId: user.id, accountId }));

  // Idempotent insert: skip rows already imported (same content hash). A
  // statement re-export always hashes the same, so re-uploads are safe.
  const ids = rows.map((r) => r.external_id);
  const { data: existing } = await sb
    .from('trades')
    .select('external_id')
    .eq('account_id', accountId)
    .in('external_id', ids);
  const have = new Set(
    (existing ?? []).map((e: { external_id: string }) => e.external_id),
  );
  const seen = new Set<string>();
  const toInsert = rows.filter((r) => {
    if (have.has(r.external_id) || seen.has(r.external_id)) return false;
    seen.add(r.external_id);
    return true;
  });

  if (toInsert.length) {
    const { error: insErr } = await sb.from('trades').insert(toInsert);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    imported: toInsert.length,
    duplicates: rows.length - toInsert.length,
    skippedRows: outcome.skippedRows,
  });
}
