import type { CoreReport } from '@/src/lib/analytics/core';

// System prompts and input builders for the AI features. System prompts are
// kept as stable, frozen strings so they remain prompt-cacheable.

export const TRADE_REVIEW_SYSTEM = `You are a seasoned trading coach reviewing one trade from a trader's journal. Give a short, sharp, process-focused review that helps them trade better next time.

Principles:
- Judge the PROCESS, not just the outcome. A losing trade taken with discipline beats a lucky win that broke the plan.
- Ground every point in the data provided: the trade details, the setup checklist (what they did and didn't tick), and their own notes, emotions, and lessons. Never invent facts you were not given.
- Be direct and specific. No filler, no hedging, no generic platitudes.
- This is educational coaching, NOT financial or investment advice. Never tell them what to buy, sell, or hold, and never predict markets.
- If key information is missing (no checklist, no notes), say so in one short phrase rather than guessing.

Format the review in Markdown with exactly these three sections and headings:

**What went well** — 1 to 3 bullets on what they did right (process, discipline, checklist adherence).
**What to watch** — 1 to 3 bullets on process leaks or risks (plan deviations, sizing, emotion, unticked criteria).
**One thing to do next time** — a single concrete, actionable habit.

Keep the whole review under 200 words.`;

type ChecklistEntry = { label: string; checked: boolean };

function field(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return `- ${label}: ${String(value)}`;
}

/** Render a trade + its checklist adherence into the user-turn text for review. */
export function buildTradeReviewInput(
  trade: Record<string, unknown>,
  checklist: ChecklistEntry[],
): string {
  const account = trade.account as
    | { name?: string | null; account_type?: string | null; base_currency?: string | null }
    | null;

  const lines: string[] = ['Review this trade.', '', '## Trade'];
  const tradeFields = [
    field('Instrument', trade.instrument),
    field('Direction', trade.direction),
    field('Outcome', trade.outcome),
    field('Net P&L', trade.net_pnl ?? trade.pnl_amount),
    field('P&L %', trade.pnl_percent),
    field('R multiple', trade.r_multiple),
    field('Risk amount', trade.risk_amount),
    field('Entry', trade.entry_price),
    field('Stop loss', trade.stop_loss),
    field('Take profit', trade.take_profit),
    field('Exit', trade.exit_price),
    field('Commission', trade.commission),
    field('Opened at', trade.opened_at),
    field('Closed at', trade.closed_at),
    field('Account', account?.name),
    field('Account type', account?.account_type),
    field('Currency', account?.base_currency),
  ].filter((l): l is string => l !== null);
  lines.push(...tradeFields);

  lines.push('', '## Setup checklist');
  if (checklist.length) {
    for (const c of checklist) lines.push(`- [${c.checked ? 'x' : ' '}] ${c.label}`);
  } else {
    lines.push('- (no checklist was attached to this trade)');
  }

  const notes = [
    field('Notes', trade.notes),
    field('Emotion', trade.emotion_tag),
    field('Lesson learned', trade.lesson_learned),
    field('Review notes', trade.review_notes),
  ].filter((l): l is string => l !== null);
  lines.push('', '## Trader notes');
  lines.push(...(notes.length ? notes : ['- (no notes recorded)']));

  return lines.join('\n');
}

export const INSIGHTS_SYSTEM = `You are a trading performance analyst reviewing a trader's aggregate stats across their whole journal. Surface the few patterns that will most improve their results.

Principles:
- Work ONLY from the stats provided (win rate, expectancy, profit factor, average win/loss, R:R, drawdown, and the per-instrument breakdown). Never invent trades or numbers you were not given.
- Be specific and quantified: cite the actual numbers. No generic advice.
- Prioritise the highest-leverage points: where the real edge is, and the single most costly leak.
- This is educational performance analysis, NOT financial or investment advice. Never tell them what to buy, sell, or hold, and never predict markets.
- If the sample is small, say so and keep conclusions tentative.

Format in Markdown with exactly these sections and headings:

**Where your edge is** — 1 to 2 bullets on genuine strengths, each with the number behind it.
**Biggest leak** — the single most costly pattern to fix, with the stat that proves it.
**Watch / next step** — 1 to 2 concrete, measurable actions.

Keep the whole thing under 220 words.`;

function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(digits);
}

/** Render an aggregate CoreReport into the compact user-turn text for insights. */
export function buildInsightsInput(report: CoreReport): string {
  const ranked = [...report.bySymbol].sort((a, b) => b.pnl - a.pnl);
  const best = ranked.slice(0, 5);
  const worst = ranked.slice(-5).reverse();

  const lines: string[] = [
    `Aggregate stats across ${report.totalTrades} trades.`,
    '',
    '## Overall',
    `- Trades: ${report.totalTrades} (W ${report.wins} / L ${report.losses} / BE ${report.breakeven})`,
    `- Win rate: ${num(report.winRate, 1)}%`,
    `- Expectancy per trade: ${num(report.expectancy)}`,
    `- Profit factor: ${num(report.profitFactor)}`,
    `- Avg win: ${num(report.avgWin)} | Avg loss: ${num(report.avgLoss)} | R:R ${num(report.rrr)}`,
    `- Net P&L: ${num(report.netPnl)}`,
    `- Max drawdown: ${num(report.maxDrawdownPct * 100, 1)}%`,
  ];

  if (best.length) {
    lines.push('', '## Best instruments (by P&L)');
    for (const s of best) {
      lines.push(
        `- ${s.symbol || '(unspecified)'}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${num(s.pnl)}`,
      );
    }
  }
  if (worst.length) {
    lines.push('', '## Weakest instruments (by P&L)');
    for (const s of worst) {
      lines.push(
        `- ${s.symbol || '(unspecified)'}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${num(s.pnl)}`,
      );
    }
  }

  lines.push(
    '',
    'P&L figures are in account base currency and may mix currencies across accounts; lean on the ratios (win rate, R:R, profit factor, expectancy) for cross-cutting conclusions.',
  );

  return lines.join('\n');
}

export const CHAT_SYSTEM = `You are the in-app help assistant for "The Trader's Hindsight," a trading journal for retail traders. Help users get the most out of the app and build better trading habits.

What the app does, so you can guide people:
- Log trades with entry/exit, P&L, R-multiple, screenshots, and notes.
- Organise trades under trading accounts (live / demo / prop), each with a starting balance and currency.
- Build setup checklists (templates) and tick criteria per trade to measure plan adherence.
- Review performance on the Dashboard, deeper stats and charts on Analytics, and a Monthly Report.
- AI features: a per-trade "AI Review" on each trade's page, and an "AI Insights" card on Analytics that summarises patterns across all trades.

How to help:
- Be concise, friendly, and practical. Give step-by-step directions when explaining how to do something in the app.
- For trading psychology and journaling-discipline questions, give thoughtful, experience-grounded coaching.
- You do NOT have access to the user's live trades or numbers. If they ask about their own stats (e.g. "what's my win rate?"), point them to where it lives (the Analytics page or the AI Insights card) rather than guessing.
- This is educational guidance, NOT financial or investment advice. Never tell anyone what to buy, sell, or hold, never predict markets or prices, and never present a specific trade or strategy as a way to make money.
- If you are unsure whether the app does something, say so plainly rather than inventing a feature.

Keep replies tight: a few sentences or a short list, unless the user asks for depth.`;
