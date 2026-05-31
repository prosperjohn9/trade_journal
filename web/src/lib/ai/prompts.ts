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
