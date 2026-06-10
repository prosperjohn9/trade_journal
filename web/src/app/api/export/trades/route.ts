import { createSupabaseWithToken, getToken } from '@/src/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/export/trades
//
// Full CSV export of the caller's journal (the data-portability promise in the
// privacy policy). RLS scopes everything to the caller; the response streams as
// a file download.

const COLUMNS = [
  'opened_at',
  'closed_at',
  'account',
  'instrument',
  'direction',
  'outcome',
  'entry_price',
  'exit_price',
  'stop_loss',
  'take_profit',
  'volume',
  'pnl_amount',
  'commission',
  'net_pnl',
  'pnl_percent',
  'risk_amount',
  'r_multiple',
  'emotion_tag',
  'notes',
  'lesson_learned',
  'import_source',
  'external_id',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sb = createSupabaseWithToken(token);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [{ data: trades, error }, { data: accounts }] = await Promise.all([
    sb
      .from('trades')
      .select(
        'opened_at, closed_at, account_id, instrument, direction, outcome, entry_price, exit_price, stop_loss, take_profit, volume, pnl_amount, commission, net_pnl, pnl_percent, risk_amount, r_multiple, emotion_tag, notes, lesson_learned, import_source, external_id',
      )
      .order('opened_at', { ascending: true }),
    sb.from('accounts').select('id, name'),
  ]);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const accountName = new Map(
    ((accounts ?? []) as { id: string; name: string }[]).map((a) => [
      a.id,
      a.name,
    ]),
  );

  const lines = [COLUMNS.join(',')];
  for (const t of (trades ?? []) as Array<Record<string, unknown>>) {
    lines.push(
      COLUMNS.map((col) =>
        csvCell(
          col === 'account'
            ? (accountName.get(String(t.account_id)) ?? '')
            : t[col],
        ),
      ).join(','),
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trades-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
