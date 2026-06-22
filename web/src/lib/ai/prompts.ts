import type { CoreReport } from '@/src/lib/analytics/core';
import type { BehaviorSignals } from '@/src/lib/analytics/behavior';
import type { GuardContext, GuardSignal } from '@/src/lib/analytics/tradeGuard';

// System prompts and input builders for the AI features. System prompts are
// kept as stable, frozen strings so they remain prompt-cacheable.

export const TRADE_REVIEW_SYSTEM = `You are a seasoned trading coach reviewing one trade from a trader's journal. Give a short, sharp, process-focused review that helps them trade better next time.

Principles:
- Judge the PROCESS, not just the outcome. A losing trade taken with discipline beats a lucky win that broke the plan.
- Ground every point in the data provided: the trade details, the setup checklist (what they did and didn't tick), and their own notes, emotions, and lessons. Never invent facts you were not given.
- Be direct and specific. No filler, no hedging, no generic platitudes.
- Money figures come with the account currency symbol (for example $231 or £554). Keep that symbol on every profit, loss, and P&L number you write.
- This is educational coaching, not financial or investment advice. Never tell them what to buy, sell, or hold, and never predict markets. Do not add your own disclaimer line; the app already shows one.
- Write in a natural, human voice. Never use em-dashes or en-dashes (the "—" / "–" characters); use full stops and commas, and finish every sentence.
- If key information is missing (no checklist, no notes), say so in one short phrase rather than guessing.

Format the review in Markdown with exactly these three sections and headings:

**What went well**: 1 to 3 bullets on what they did right (process, discipline, checklist adherence).
**What to watch**: 1 to 3 bullets on process leaks or risks (plan deviations, sizing, emotion, unticked criteria).
**One thing to do next time**: a single concrete, actionable habit.

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
  const ccy = account?.base_currency ?? 'USD';
  const netPnlRaw = trade.net_pnl ?? trade.pnl_amount;

  const lines: string[] = ['Review this trade.', '', '## Trade'];
  const tradeFields = [
    field('Instrument', trade.instrument),
    field('Direction', trade.direction),
    field('Outcome', trade.outcome),
    field('Net P&L', netPnlRaw != null ? money(Number(netPnlRaw), ccy, true) : null),
    field('P&L %', trade.pnl_percent),
    field('R multiple', trade.r_multiple),
    field('Risk amount', trade.risk_amount != null ? money(Number(trade.risk_amount), ccy) : null),
    field('Entry', trade.entry_price),
    field('Stop loss', trade.stop_loss),
    field('Take profit', trade.take_profit),
    field('Exit', trade.exit_price),
    field('Commission', trade.commission != null ? money(Number(trade.commission), ccy) : null),
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

export const INSIGHTS_SYSTEM = `You are a sharp trading-performance coach. You are given a trader's aggregate stats AND behavioural signals computed across their whole journal. Find the few behavioural patterns (leaks) quietly costing them money, and the genuine edge worth protecting. These are patterns traders rarely see in themselves.

Hunt specifically for:
- Time/session decay: win rate or expectancy that collapses in a particular session (Asia / London / Overlap / New York) or on a particular weekday.
- Tilt / revenge trading: worse results, or larger size, on the trade(s) right after a loss or after 2+ consecutive losses.
- The disposition effect: holding losers much longer than winners.
- Emotion leaks: emotion tags that correlate with losing trades.
- Sizing leaks: bigger size on losers than winners.

Principles:
- Work ONLY from the numbers provided. Never invent trades, sessions, or figures.
- Quantify everything with the actual number, and contrast against the overall baseline so the leak is obvious. "Win rate is 58% overall but 31% in the Asian session" beats "watch your Asian trades".
- Money figures come with the account currency symbol (for example $231 or £554). Keep that symbol on every profit, loss, and P&L number you write. Never output a bare number for money.
- Prioritise the SINGLE most costly leak. Don't list ten small things.
- If the sample behind a pattern is small (few trades), say so and keep it tentative.
- This is educational behavioural coaching, not financial or investment advice. Never tell them what to buy, sell, or hold, and never predict markets. Do not add your own disclaimer line; the app already shows one.

Voice (this matters a lot):
- Write like a real coach talking to one trader, not an AI report.
- Never use em-dashes or en-dashes (the "—" or "–" characters). Use full stops and commas, and finish every thought as a complete sentence. Do not write telegraphic fragments where a dash stands in for a verb.
- Be plain, direct, and specific. Short sentences are good. Skip filler words.

Format in Markdown with exactly these three headings:

**Your edge**: one or two bullets on what genuinely works (a session, weekday, setup, or condition where they make money), each with the number.
**Your biggest leak**: the single most costly behavioural pattern, named plainly, with the stat that proves it and a sense of the cost.
**The pattern to break**: one concrete, measurable rule that fixes that leak.

Keep the whole thing under 240 words.`;

function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(digits);
}

/** Format a money amount with the account currency symbol, e.g. "$231" or
 *  "-£990". signed=true always shows the +/- sign (good for P&L). Falls back to
 *  "CODE 231" for currencies Intl does not recognise. */
function money(amount: number, currency = 'USD', signed = false): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const code = (currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      signDisplay: signed ? 'always' : 'auto',
    }).format(value);
  } catch {
    const n = value.toFixed(2);
    return signed && value > 0 ? `+${code} ${n}` : `${code} ${n}`;
  }
}

/** Render the aggregate CoreReport + behavioural signals into the user-turn text. */
export function buildInsightsInput(
  report: CoreReport,
  behavior?: BehaviorSignals,
  currency = 'USD',
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
    `- Expectancy per trade: ${money(report.expectancy, currency, true)}`,
    `- Profit factor: ${num(report.profitFactor)}`,
    `- Avg win: ${money(report.avgWin, currency)} | Avg loss: ${money(report.avgLoss, currency)} | R:R ${num(report.rrr)}`,
    `- Net P&L: ${money(report.netPnl, currency, true)}`,
    `- Max drawdown: ${num(report.maxDrawdownPct * 100, 1)}%`,
  ];

  if (best.length) {
    lines.push('', '## Best instruments (by P&L)');
    for (const s of best) {
      lines.push(
        `- ${s.symbol || '(unspecified)'}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${money(s.pnl, currency, true)}`,
      );
    }
  }
  if (worst.length) {
    lines.push('', '## Weakest instruments (by P&L)');
    for (const s of worst) {
      lines.push(
        `- ${s.symbol || '(unspecified)'}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${money(s.pnl, currency, true)}`,
      );
    }
  }

  if (behavior) lines.push(formatBehavior(behavior, currency));

  lines.push(
    '',
    `Money is shown in ${currency} with its symbol; keep that symbol on every profit, loss, and P&L figure in your reply. Stats may mix currencies across accounts, so lean on ratios (win rate, R:R, profit factor) for cross-cutting conclusions.`,
  );

  return lines.join('\n');
}

function pad1(n: number | null, suffix = ''): string {
  return n != null ? `${num(n, 0)}${suffix}` : 'n/a';
}

function formatBehavior(b: BehaviorSignals, currency = 'USD'): string {
  const lines: string[] = ['', '## Behavioural signals (use these to find leaks)'];

  lines.push('', '### By session (worst P&L first)');
  for (const s of b.bySession) {
    lines.push(
      `- ${s.key}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${money(s.netPnl, currency, true)} (avg ${money(s.avgPnl, currency, true)})`,
    );
  }

  lines.push('', '### By weekday (worst P&L first)');
  for (const s of b.byDayOfWeek) {
    lines.push(
      `- ${s.key}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${money(s.netPnl, currency, true)}`,
    );
  }

  if (b.byEmotion.length) {
    lines.push('', '### By emotion tag (worst P&L first)');
    for (const s of b.byEmotion) {
      lines.push(
        `- ${s.key}: ${s.count} trades, ${num(s.winRate, 0)}% win, P&L ${money(s.netPnl, currency, true)}`,
      );
    }
  }

  const seq = b.sequence;
  lines.push('', '### Sequence / tilt after losses');
  lines.push(`- Overall win rate: ${num(seq.overallWinRate, 0)}%`);
  lines.push(
    `- Right after a loss: ${seq.afterLoss.count} trades, ${num(seq.afterLoss.winRate, 0)}% win, avg P&L ${money(seq.afterLoss.avgPnl, currency, true)}`,
  );
  lines.push(
    `- Right after a win: ${seq.afterWin.count} trades, ${num(seq.afterWin.winRate, 0)}% win, avg P&L ${money(seq.afterWin.avgPnl, currency, true)}`,
  );
  lines.push(
    `- After 2+ losses in a row: ${seq.afterTwoLosses.count} trades, ${num(seq.afterTwoLosses.winRate, 0)}% win, avg P&L ${money(seq.afterTwoLosses.avgPnl, currency, true)}`,
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
- If the user wants to talk to a person, tell them to tap the "Talk to a human" link at the top of this chat window. During 8am-10pm Lagos (Nigeria) time, WAT it opens live chat with the team; outside those hours it forwards their message to the team, who reply by email. They can also reach us through the [Contact page](/contact).

HOW TO ANSWER:
- Give accurate, step-by-step directions using the real menu names above.
- Never show internal URLs, route paths, or developer details (for example "/trades/new"). Refer to pages by their on-screen names. When you point someone to the Contact page, write it as a Markdown link: [Contact page](/contact).
- For trading psychology and discipline, give thoughtful, experience-grounded coaching.
- You may be given the user's current performance numbers below; use them ONLY when they ask about their own results, and don't volunteer them.
- Money figures come with the account currency symbol (for example $231 or £554). Keep that symbol on every money number you mention.
- This is educational guidance, NOT financial or investment advice. Never tell anyone what to buy, sell, or hold, never predict markets, and never present a trade or strategy as a way to make money.
- If you genuinely don't know whether the app does something, say so rather than inventing it.

Keep replies tight: a few sentences or a short list unless the user asks for depth. Write in a natural, human voice and never use em-dashes (the "—" character); use full stops and commas.`;

/** Compact, opt-in performance context so the chatbot can answer questions about
 *  the user's own results without being handed raw trades. */
export function buildChatStatsContext(
  report: CoreReport | null,
  currency = 'USD',
): string {
  if (!report || report.totalTrades === 0) {
    return "The user has no trades logged yet. If they ask about their performance, tell them to add some trades first.";
  }
  const ranked = [...report.bySymbol].sort((a, b) => b.pnl - a.pnl);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const lines = [
    "The user's current performance (use only if they ask about their own stats; do not volunteer):",
    `- Trades: ${report.totalTrades}, win rate ${num(report.winRate, 1)}%`,
    `- Profit factor ${num(report.profitFactor)}, expectancy ${money(report.expectancy, currency, true)} per trade, avg R:R ${num(report.rrr)}`,
    `- Net P&L ${money(report.netPnl, currency, true)}, max drawdown ${num(report.maxDrawdownPct * 100, 1)}%`,
  ];
  if (best) {
    lines.push(
      `- Best instrument by P&L: ${best.symbol || 'n/a'} (${best.count} trades, ${num(best.winRate, 0)}% win, P&L ${money(best.pnl, currency, true)})`,
    );
  }
  if (worst && worst !== best) {
    lines.push(
      `- Weakest by P&L: ${worst.symbol || 'n/a'} (${worst.count} trades, ${num(worst.winRate, 0)}% win, P&L ${money(worst.pnl, currency, true)})`,
    );
  }
  if (report.totalTrades < 10) {
    lines.push('- Small sample, so keep any conclusions tentative.');
  }
  return lines.join('\n');
}

// --- Live Guard: real-time second opinion at the moment of entry ----------

export const GUARD_SYSTEM = `You are Foresight, a trading buddy giving a real, useful read on a trade the moment it opens. You are handed SIGNALS already computed from real data: trend per timeframe, reward-to-risk, risk size, nearby structure/levels, spread, the prop news rule, and the trader's own historical leaks. Every signal is fact.

ALWAYS give a substantive read, never a bare "looks fine". Open with the single most important point in one short, direct sentence (the verdict the trader needs at a glance). Then, in 3 to 5 tight sentences, weave together, in plain language:
- Trend: which way the timeframes are pointing and whether the trade is with them or against them. Name the timeframes.
- Reward-to-risk and what win rate it implies (use the R:R signal's numbers).
- Risk size in money and percent.
- Any level sitting in front of the stop or target (or that the path is clear).
- News: any high-impact event near the trade and roughly when, or that the calendar is clear and conditions are calm if there is none.
- Stop vs volatility (the ATR signal), and open exposure if other trades are running.
- Anything tied to the trader's own record: a rule they committed to that this breaks, their win rate on this pair, their worst session, or how this risk sits against their prop drawdown buffer. Lead with these when present, they land hardest.

Lead with anything marked caution or warning, and name it plainly if it ties to the trader's own rule or past leak. Even when nothing is wrong, still give the read using the actual numbers and trend, explain WHY it looks reasonable, do not just say it is fine.

Timeframes and setup:
- The input tells you which timeframes you read. If no analysis timeframe was given, you read the 1H and 4H; briefly say so as a day-trader default, and tell them they can set this account's analysis and execution timeframe under Settings, Accounts (the MetaTrader panel) so every read uses it. If a timeframe WAS given, do not mention the default or where to set it.
- If a setup is tagged, weave its name and criteria in as a quick checklist reminder ("your X setup calls for ...").
- If NO setup is given, do not mention setups at all and never speculate that it might be a random or unplanned trade. Just read the trade.

Hard rules:
- No directional advice or calls. Do not say buy, sell, hold, exit, add, take profit, or "this will". You give context and their own rules; the decision is theirs.
- Use ONLY the signals provided. Never invent trend, levels, news, or numbers.
- Do not predict price or slippage. State conditions that exist, not outcomes.
- Plain English for a normal trader, not an analyst. The first time you use a technical term (ATR, R or R-multiple, pips, drawdown, profit factor), add a short plain gloss in parentheses, e.g. "ATR (its typical hourly move)", "11.6R (risking 1 to make 11.6)". Keep the numbers, just make them understandable.
- A punchy opening line plus 3 to 5 tight sentences. Keep it short enough to read on a phone the moment a trade opens. Finish your thought; never trail off or stop mid-sentence. Plain and human, no hype, no emojis, no headings. Never use em-dashes (the "—" character); use commas and full stops.`;

function guardSideWord(side: GuardContext['side']): string {
  return side === 'BUY' ? 'long' : 'short';
}

/** Compact, factual input for the narrator: the trade, then the signals that
 *  fired. The model narrates these; it is told (in the system prompt) not to
 *  add anything of its own. */
export function buildGuardInput(
  ctx: GuardContext,
  signals: GuardSignal[],
): string {
  const lines: string[] = [];
  lines.push(
    `Trade just opened: ${guardSideWord(ctx.side)} ${ctx.symbol}, ${ctx.volumeLots} lots, entry ${ctx.entry}` +
      `${ctx.stopLoss != null ? `, stop ${ctx.stopLoss}` : ', no stop'}` +
      `${ctx.takeProfit != null ? `, target ${ctx.takeProfit}` : ''}.`,
  );

  // Timeframe context.
  const tfRead = ctx.timeframes.map((t) => t.tf).join(' and ');
  if (ctx.analyzedTf) {
    lines.push(
      `Trader analyzed on the ${ctx.analyzedTf}${ctx.executedTf ? ` and executed on the ${ctx.executedTf}` : ''}. Timeframes I read: ${tfRead || 'none available'}.`,
    );
  } else {
    lines.push(
      `No analysis timeframe given, so assume a day trader. Timeframes I read: ${tfRead || 'none available'}.`,
    );
  }

  // Setup context (only when provided).
  if (ctx.setup) {
    lines.push(
      `Tagged setup: ${ctx.setup.name}.${ctx.setup.criteria.length ? ` Its criteria: ${ctx.setup.criteria.join('; ')}.` : ''}`,
    );
  }

  if (signals.length === 0) {
    lines.push('Signals: none notable, give the read from the trade and timeframe context above.');
    return lines.join('\n');
  }
  lines.push('Signals (most serious first):');
  for (const s of signals) {
    lines.push(`- [${s.severity}] ${s.title}: ${s.detail}`);
  }
  return lines.join('\n');
}

export const CLOSE_SYSTEM = `You are Foresight, closing the loop on a trade you read when it opened. The trade is now closed. Your one job is the Hindsight lesson: judge the trade by its PROCESS, not by whether the number came out green or red. You are given exactly what you flagged at entry and how it actually closed (win, loss, or breakeven, with the money).

This is the whole point of the product, so land it:
- A WIN on a trade you FLAGGED is a reinforced leak, NOT validation. Name the flag(s). Winning while breaking your own rule is exactly how a bad habit sticks. Do not congratulate it; warn that the green number is the trap.
- A LOSS on a CLEAN trade (nothing flagged) is just variance, a normal losing trade, not a behavioural mistake. Tell them plainly not to overcorrect or change anything.
- A LOSS on a FLAGGED trade is the flagged risk showing up. The warning was a leak to fix, not bad luck. Say which flag bit.
- A WIN on a CLEAN trade is process and result aligned, the standard to repeat. Affirm it briefly and specifically.
- A BREAKEVEN on a FLAGGED trade means you dodged it this time. Flat is luck, not a green light, the leak is still live. Tell them not to keep taking that setup.
- A BREAKEVEN on a CLEAN trade is neutral; say so without drama.

Write 2 to 4 tight sentences. Be specific: reference the actual flags by name (or, if clean, say nothing was flagged). Give one concrete takeaway they can act on. No generic praise or scolding, no "good job" / "bad trade", no hype. No directional advice and no predicting their next trade. Plain English, no emojis, no headings, never use em-dashes (use commas and full stops). Finish your thought.`;

/** Input for the close-the-loop narrator: how it closed + what was flagged at
 *  entry. The model writes the Hindsight reflection from these facts only. */
export function buildCloseInput(input: {
  symbol: string;
  side: string;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  pnl: number;
  currency: string;
  flags: string[];
  entryTldr: string | null;
}): string {
  const sideWord = input.side === 'SELL' ? 'short' : 'long';
  const money = `${input.pnl >= 0 ? '+' : ''}${input.pnl.toFixed(2)} ${input.currency}`;
  const verb =
    input.outcome === 'WIN'
      ? 'closed in profit'
      : input.outcome === 'LOSS'
        ? 'closed at a loss'
        : 'closed flat (breakeven)';
  const lines = [`Your ${sideWord} ${input.symbol} ${verb}: ${money}.`];
  if (input.flags.length > 0) {
    lines.push(`At entry I flagged: ${[...new Set(input.flags)].join('; ')}.`);
  } else {
    lines.push('At entry nothing was flagged: it was a clean read.');
  }
  if (input.entryTldr) lines.push(`Entry headline: ${input.entryTldr}`);
  return lines.join('\n');
}
