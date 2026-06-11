// File-import engine: turns broker statements into trade rows. Handles the
// MT5 HTML report (the desktop terminal's Toolbox -> History -> Report), plus
// generic CSV/XLSX exports from cTrader, TradeLocker, DXtrade, MatchTrader and
// friends via header heuristics. Pure parsing, no I/O; costs nothing per user.

export type ParsedTrade = {
  instrument: string;
  direction: 'BUY' | 'SELL';
  opened_at: string; // ISO
  closed_at: string | null;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  volume: number | null;
  grossProfit: number; // profit excluding commission/swap when those are separate
  costs: number; // commission + swap as a positive cost (0 if unknown)
};

export type ParseOutcome = {
  trades: ParsedTrade[];
  skippedRows: number;
  error?: string;
};

// --- small utils -------------------------------------------------------------

/** Parse numbers from broker exports: "1 234.56", "1,234.56", "-12,5", "(15.2)". */
function num(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || s === '-' || s === '—') return null;
  const negParen = /^\(.*\)$/.test(s);
  s = s.replace(/[()\s ]/g, '').replace(/[$€£₺%]/g, '');
  // "1.234,56" (EU) vs "1,234.56" (US): if both separators exist, the last one
  // is the decimal mark; if only commas, treat a single trailing comma-group of
  // 1-2 digits as decimal.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s =
      lastComma > lastDot
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const frac = s.length - lastComma - 1;
    s = frac <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negParen ? -n : n;
}

/** Loose datetime parser for broker formats ("2026.06.10 14:23:11", ISO, etc). */
function dateIso(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  let s = String(raw).trim();
  if (!s) return null;
  // MT-style "2026.06.10 14:23:11" -> ISO-ish.
  const mt = s.match(/^(\d{4})\.(\d{2})\.(\d{2})(.*)$/);
  if (mt) s = `${mt[1]}-${mt[2]}-${mt[3]}${mt[4]}`;
  // "10/06/2026 ..." is ambiguous; let Date try (US semantics) as a last resort.
  let t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function direction(raw: unknown): 'BUY' | 'SELL' | null {
  const s = String(raw ?? '').toLowerCase();
  if (/(^|\b)(buy|long)\b/.test(s)) return 'BUY';
  if (/(^|\b)(sell|short)\b/.test(s)) return 'SELL';
  return null;
}

/** FNV-1a: stable id for dedup across re-uploads of the same statement. */
export function rowHash(parts: Array<string | number | null>): string {
  const s = parts.map((p) => (p == null ? '' : String(p))).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// --- CSV ---------------------------------------------------------------------

/** RFC-4180-ish CSV -> rows. Handles quotes, embedded commas/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',' || c === ';' || c === '\t') {
      // Some exports use ; or tab; treat the first row's winner consistently is
      // overkill — splitting on any of them works for real-world statements.
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

// --- MT5 HTML report ----------------------------------------------------------

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Extract every <tr> as an array of cell texts. */
function htmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    let td: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((td = cellRe.exec(tr[1]))) cells.push(stripTags(td[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/** Parse the "Positions" section of an MT5 trade history report.
 *  Columns: Time, Position, Symbol, Type, Volume, Price, S/L, T/P,
 *           Time(close), Price(close), Commission, Swap, Profit */
export function parseMt5Html(html: string): ParseOutcome {
  const rows = htmlTableRows(html);
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map((c) => c.toLowerCase());
    if (
      lower.includes('position') &&
      lower.includes('symbol') &&
      lower.includes('volume')
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      trades: [],
      skippedRows: 0,
      error:
        'This does not look like an MT5 trade history report (no Positions table found). In MT5: Toolbox, History tab, right-click, Report.',
    };
  }

  const trades: ParsedTrade[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 13) {
      // Section ended (Orders/Deals headers, totals, etc).
      if (r.map((c) => c.toLowerCase()).includes('orders')) break;
      continue;
    }
    const dir = direction(r[3]);
    const opened = dateIso(r[0]);
    const symbol = (r[2] ?? '').trim();
    if (!dir || !opened || !symbol) {
      skipped++;
      continue;
    }
    const commission = num(r[10]) ?? 0;
    const swap = num(r[11]) ?? 0;
    trades.push({
      instrument: symbol.toUpperCase(),
      direction: dir,
      opened_at: opened,
      closed_at: dateIso(r[8]),
      entry_price: num(r[5]),
      exit_price: num(r[9]),
      stop_loss: num(r[6]),
      take_profit: num(r[7]),
      volume: num(r[4]),
      grossProfit: num(r[12]) ?? 0,
      costs: -(commission + swap), // MT5 reports these as negatives
    });
  }
  return { trades, skippedRows: skipped };
}

// --- Generic tabular (CSV / XLSX rows) ----------------------------------------

const HEADER_PATTERNS: Record<string, RegExp> = {
  symbol: /^(symbol|instrument|pair|market|ticker|asset)$/,
  direction: /^(type|side|direction|action|buy\/sell|order ?type|position ?type)$/,
  openTime: /^(open ?(time|date)|opened( at)?|entry ?(time|date)|created( at)?|time)$/,
  closeTime: /^(close ?(time|date)|closed( at)?|exit ?(time|date))$/,
  volume: /^(volume|lots?|size|quantity|qty|contracts?)$/,
  openPrice: /^(open ?price|entry( price)?|price ?open|avg\.? ?entry|open)$/,
  closePrice: /^(close ?price|exit( price)?|price ?close|avg\.? ?exit|close)$/,
  stopLoss: /^(s\/l|sl|stop ?loss)$/,
  takeProfit: /^(t\/p|tp|take ?profit)$/,
  profit: /^(net ?(profit|pnl|p&l)|profit|pnl|p&l|gain|result)$/,
  commission: /^(commissions?|fees?)$/,
  swap: /^(swaps?|rollover|financing)$/,
};

function mapHeaders(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((raw, idx) => {
    const h = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [field, re] of Object.entries(HEADER_PATTERNS)) {
      if (!map.has(field) && re.test(h)) {
        map.set(field, idx);
        break;
      }
    }
  });
  return map;
}

/** Generic mapper for CSV/XLSX rows from any platform. The first row that
 *  matches enough known headers is treated as the header row (statements often
 *  have title/preamble rows above the table). */
export function parseTabular(rows: Array<Array<unknown>>): ParseOutcome {
  let headers: Map<string, number> | null = null;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const candidate = mapHeaders(rows[i].map((c) => String(c ?? '')));
    if (
      candidate.has('symbol') &&
      candidate.has('profit') &&
      (candidate.has('openTime') || candidate.has('closeTime'))
    ) {
      headers = candidate;
      headerIdx = i;
      break;
    }
  }
  if (!headers) {
    return {
      trades: [],
      skippedRows: 0,
      error:
        'Could not find the trade columns. The file needs at least: symbol/instrument, profit/PnL, and an open or close time column.',
    };
  }

  const col = (field: string, r: Array<unknown>) => {
    const i = headers.get(field);
    return i == null ? null : r[i];
  };

  const trades: ParsedTrade[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const symbol = String(col('symbol', r) ?? '').trim();
    const profit = num(col('profit', r));
    const dirRaw = col('direction', r);
    const dir = direction(dirRaw) ?? 'BUY';
    const opened =
      dateIso(col('openTime', r)) ?? dateIso(col('closeTime', r));
    // Rows that aren't trades: balance ops, totals, empty padding.
    const looksLikeBalanceOp = /balance|deposit|withdraw|credit/i.test(
      String(dirRaw ?? ''),
    );
    if (!symbol || profit == null || !opened || looksLikeBalanceOp) {
      skipped++;
      continue;
    }
    const commission = num(col('commission', r)) ?? 0;
    const swap = num(col('swap', r)) ?? 0;
    trades.push({
      instrument: symbol.toUpperCase(),
      direction: dir,
      opened_at: opened,
      closed_at: dateIso(col('closeTime', r)),
      entry_price: num(col('openPrice', r)),
      exit_price: num(col('closePrice', r)),
      stop_loss: num(col('stopLoss', r)),
      take_profit: num(col('takeProfit', r)),
      volume: num(col('volume', r)),
      grossProfit: profit,
      costs: -(commission + swap),
    });
  }
  return { trades, skippedRows: skipped };
}
