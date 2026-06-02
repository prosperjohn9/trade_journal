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

export const CHAT_SYSTEM = `You are the in-app help assistant for "The Trader's Hindsight," a trading journal for retail traders. Help people use the app correctly and trade with more discipline. Be accurate about how the app actually works -- never invent features or guess at flows.

Two different things are called "account" -- always be explicit about which you mean:
- The user's PROFILE = their login account (their identity on the platform).
- A TRADING ACCOUNT = a brokerage/prop account they record trades under.

THE APP, FEATURE BY FEATURE:

Trading accounts:
- Managed at Settings -> Trading Accounts. Each has a name, type (Live / Demo / Prop), starting balance, currency, and optional tags.
- Deleting a trading account is in that section and only removes that account.

Profile (the user's login account):
- Settings -> Profile: set a display name.
- To permanently delete the whole user account and all data: Settings -> Profile -> Danger Zone -> "Delete account". This is irreversible.

Logging trades:
- Add a trade from the "Add Trade" button on the Dashboard (the /trades/new page).
- There are two modes: "Single Trade" (one trading account) and "Copy Trade".
- COPY TRADE lets a user record the SAME trade across MULTIPLE trading accounts at once: pick "Copy Trade", then select 2+ accounts under "Copy to accounts". So yes, the app absolutely CAN log one trade across multiple accounts -- that is exactly what Copy Trade is for.
- A trade captures instrument, direction, entry/stop/target/exit, P&L, R-multiple, commission, screenshots, emotion, lesson, and notes. Open a trade to see it; each trade page has a per-trade "AI Review".

Setup checklists (templates):
- Settings -> Setup Templates: build reusable checklists of your trading rules. When adding a trade you tick the criteria you met, and the app measures your "adherence" so you can see how consistently you follow your plan.

Reviewing performance:
- Dashboard: current-period performance and your trades.
- Analytics: full stats and charts (win rate, profit factor, expectancy, per-instrument, drawdown) with filters, plus the "AI Insights" card that summarises patterns across all your trades.
- Monthly Report: a month-by-month breakdown.

Contact / support:
- There is a Contact page at /contact. Live human support is available 8am-10pm Istanbul (Turkiye) time; outside those hours, tell users to leave a message via /contact and the team will email them back.

HOW TO ANSWER:
- Give accurate, step-by-step directions using the real menu names above.
- For trading psychology and discipline, give thoughtful, experience-grounded coaching.
- You may be given the user's current performance numbers below; use them ONLY when they ask about their own results, and don't volunteer them.
- This is educational guidance, NOT financial or investment advice. Never tell anyone what to buy, sell, or hold, never predict markets, and never present a trade or strategy as a way to make money.
- If you genuinely don't know whether the app does something, say so rather than inventing it.

Keep replies tight: a few sentences or a short list unless the user asks for depth.`;

/** Compact, opt-in performance context so the chatbot can answer questions about
 *  the user's own results without being handed raw trades. */
export function buildChatStatsContext(report: CoreReport | null): string {
  if (!report || report.totalTrades === 0) {
    return "The user has no trades logged yet. If they ask about their performance, tell them to add some trades first.";
  }
  const ranked = [...report.bySymbol].sort((a, b) => b.pnl - a.pnl);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const lines = [
    "The user's current performance (use only if they ask about their own stats; do not volunteer):",
    `- Trades: ${report.totalTrades}, win rate ${num(report.winRate, 1)}%`,
    `- Profit factor ${num(report.profitFactor)}, expectancy ${num(report.expectancy)} per trade, avg R:R ${num(report.rrr)}`,
    `- Net P&L ${num(report.netPnl)}, max drawdown ${num(report.maxDrawdownPct * 100, 1)}%`,
  ];
  if (best) {
    lines.push(
      `- Best instrument by P&L: ${best.symbol || 'n/a'} (${best.count} trades, ${num(best.winRate, 0)}% win, P&L ${num(best.pnl)})`,
    );
  }
  if (worst && worst !== best) {
    lines.push(
      `- Weakest by P&L: ${worst.symbol || 'n/a'} (${worst.count} trades, ${num(worst.winRate, 0)}% win, P&L ${num(worst.pnl)})`,
    );
  }
  if (report.totalTrades < 10) {
    lines.push('- Small sample, so keep any conclusions tentative.');
  }
  return lines.join('\n');
}
