import type { CoreReport } from '@/src/lib/analytics/core';
import type { BehaviorSignals } from '@/src/lib/analytics/behavior';

// System prompts and input builders for the AI features. System prompts are
// kept as stable, frozen strings so they remain prompt-cacheable.

export const TRADE_REVIEW_SYSTEM = `You are a seasoned trading coach reviewing one trade from a trader's journal. Give a short, sharp, process-focused review that helps them trade better next time.

Principles:
- Judge the PROCESS, not just the outcome. A losing trade taken with discipline beats a lucky win that broke the plan.
- Ground every point in the data provided: the trade details, the setup checklist (what they did and didn't tick), and their own notes, emotions, and lessons. Never invent facts you were not given.
- Be direct and specific. No filler, no hedging, no generic platitudes.
- This is educational coaching, NOT financial or investment advice. Never tell them what to buy, sell, or hold, and never predict markets. Do NOT add your own disclaimer line — the app already shows one.
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

export const INSIGHTS_SYSTEM = `You are a sharp trading-performance coach. You are given a trader's aggregate stats AND behavioural signals computed across their whole journal. Find the few BEHAVIOURAL patterns — leaks — quietly costing them money, and the genuine edge worth protecting. These are patterns traders rarely see in themselves.

Hunt specifically for:
- Time/session decay: win rate or expectancy that collapses in a particular session (Asia / London / Overlap / New York) or on a particular weekday.
- Tilt / revenge trading: worse results, or larger size, on the trade(s) right after a loss or after 2+ consecutive losses.
- The disposition effect: holding losers much longer than winners.
- Emotion leaks: emotion tags that correlate with losing trades.
- Sizing leaks: bigger size on losers than winners.

Principles:
- Work ONLY from the numbers provided. Never invent trades, sessions, or figures.
- Quantify everything with the actual number, and contrast against the overall baseline so the leak is obvious. "Win rate is 58% overall but 31% in the Asian session" beats "watch your Asian trades".
- Prioritise the SINGLE most costly leak. Don't list ten small things.
- If the sample behind a pattern is small (few trades), say so and keep it tentative.
- This is educational behavioural coaching, NOT financial or investment advice. Never tell them what to buy, sell, or hold, and never predict markets. Do NOT add your own disclaimer line — the app already shows one.

Format in Markdown with exactly these sections and headings:

**Your edge** — 1 to 2 bullets on what genuinely works (a session, weekday, setup, or condition where they make money), each with the number.
**Your biggest leak** — the single most costly behavioural pattern, named plainly, with the stat that proves it and a sense of the cost.
**The pattern to break** — one concrete, measurable rule to fix that leak (e.g. "no new trade within 15 minutes of a loss", "stop after 2 reds", "cut size back to baseline after a loss").

Keep the whole thing under 240 words.`;

function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(digits);
}

/** Render the aggregate CoreReport + behavioural signals into the user-turn text. */
export function buildInsightsInput(
  report: CoreReport,
  behavior?: BehaviorSignals,
): string {
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

  if (behavior) lines.push(formatBehavior(behavior));

  lines.push(
    '',
    'P&L figures are in account base currency and may mix currencies across accounts; lean on the ratios (win rate, R:R, profit factor, expectancy) for cross-cutting conclusions.',
  );

  return lines.join('\n');
}

function pad1(n: number | null, suffix = ''): string {
  return n != null ? `${num(n, 0)}${suffix}` : 'n/a';
}

function formatBehavior(b: BehaviorSignals): string {
  const lines: string[] = ['', '## Behavioural signals (use these to find leaks)'];

  lines.push('', '### By session (worst P&L first)');
  for (const s of b.bySession) {
    lines.push(
      `- ${s.key}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${num(s.netPnl)} (avg ${num(s.avgPnl)})`,
    );
  }

  lines.push('', '### By weekday (worst P&L first)');
  for (const s of b.byDayOfWeek) {
    lines.push(
      `- ${s.key}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${num(s.netPnl)}`,
    );
  }

  if (b.byEmotion.length) {
    lines.push('', '### By emotion tag (worst P&L first)');
    for (const s of b.byEmotion) {
      lines.push(
        `- ${s.key}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${num(s.netPnl)}`,
      );
    }
  }

  const seq = b.sequence;
  lines.push('', '### Sequence / tilt after losses');
  lines.push(`- Overall win rate: ${num(seq.overallWinRate, 0)}%`);
  lines.push(
    `- Right after a loss: ${seq.afterLoss.count} trades, ${num(seq.afterLoss.winRate, 0)}% win, avg P&L ${num(seq.afterLoss.avgPnl)}`,
  );
  lines.push(
    `- Right after a win: ${seq.afterWin.count} trades, ${num(seq.afterWin.winRate, 0)}% win, avg P&L ${num(seq.afterWin.avgPnl)}`,
  );
  lines.push(
    `- After 2+ losses in a row: ${seq.afterTwoLosses.count} trades, ${num(seq.afterTwoLosses.winRate, 0)}% win, avg P&L ${num(seq.afterTwoLosses.avgPnl)}`,
  );
  lines.push(`- Longest losing streak: ${seq.maxConsecutiveLosses}`);

  if (b.holdTime.avgWinnerMin != null || b.holdTime.avgLoserMin != null) {
    lines.push('', '### Hold time (disposition effect)');
    lines.push(`- Avg winner held: ${pad1(b.holdTime.avgWinnerMin, ' min')}`);
    lines.push(`- Avg loser held: ${pad1(b.holdTime.avgLoserMin, ' min')}`);
    if (b.holdTime.ratioLoserOverWinner != null) {
      lines.push(
        `- Losers held ${num(b.holdTime.ratioLoserOverWinner, 1)}x as long as winners`,
      );
    }
  }

  if (b.size.avgWinnerVolume != null || b.size.avgLoserVolume != null) {
    lines.push('', '### Position size (lots)');
    if (b.size.avgWinnerVolume != null)
      lines.push(`- Avg size on winners: ${num(b.size.avgWinnerVolume, 2)}`);
    if (b.size.avgLoserVolume != null)
      lines.push(`- Avg size on losers: ${num(b.size.avgLoserVolume, 2)}`);
    if (b.size.avgVolumeAfterLoss != null && b.size.avgVolumeOverall != null)
      lines.push(
        `- Avg size right after a loss: ${num(b.size.avgVolumeAfterLoss, 2)} (overall avg ${num(b.size.avgVolumeOverall, 2)})`,
      );
  }

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
- Add a trade from the "Add Trade" button on the Dashboard.
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
- If the user wants to talk to a person, tell them to tap the "Talk to a human" link at the top of this chat window. During 8am-10pm Istanbul (Turkiye) time it opens live chat with the team; outside those hours it forwards their message to the team, who reply by email. They can also reach us through the [Contact page](/contact).

HOW TO ANSWER:
- Give accurate, step-by-step directions using the real menu names above.
- Never show internal URLs, route paths, or developer details (for example "/trades/new"). Refer to pages by their on-screen names. When you point someone to the Contact page, write it as a Markdown link: [Contact page](/contact).
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
