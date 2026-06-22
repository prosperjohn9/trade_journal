// Weekly Hindsight digest: the product's whole value proposition, in the trader's
// inbox + Telegram every week. Pure reuse of the Hindsight engine over the last 7
// days, so the numbers match what they'd see in-app. Returns both a Telegram text
// and a branded email HTML; the cron decides delivery.

import {
  computeHindsightReport,
  type HindsightTrade,
} from '@/src/lib/analytics/hindsight';

const MIN_TRADES = 5; // below this a weekly digest has nothing useful to say

function money(n: number, ccy: string): string {
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
  const s = sym[ccy];
  const v = Math.abs(Math.round(n * 100) / 100).toFixed(2);
  const sign = n < 0 ? '-' : '';
  return s ? `${sign}${s}${v}` : `${sign}${v} ${ccy}`;
}

function signed(n: number, ccy: string): string {
  return `${n >= 0 ? '+' : ''}${money(n, ccy)}`;
}

export type WeeklyDigest = {
  hasContent: boolean;
  subject: string;
  telegram: string;
  emailHtml: string;
};

const EMPTY: WeeklyDigest = {
  hasContent: false,
  subject: '',
  telegram: '',
  emailHtml: '',
};

/** Build the weekly digest from the user's last-7-days trades. */
export function buildWeeklyDigest(
  trades: HindsightTrade[],
  opts: { currency: string; appUrl: string },
): WeeklyDigest {
  const closed = trades.filter((t) => t.closed_at);
  const n = closed.length;
  if (n < MIN_TRADES) return EMPTY;

  const ccy = opts.currency;
  const report = computeHindsightReport(trades);
  const net = report.actualPnl;
  const wins = closed.filter((t) => t.outcome === 'WIN').length;
  const winRate = Math.round((wins / n) * 100);
  const leakCost = report.findings.reduce((s, f) => s + f.cost, 0);
  const biggest = report.biggest;

  const headline =
    leakCost > 0
      ? `Your week: ${money(leakCost, ccy)} lost to behavioural leaks`
      : `Your week: ${signed(net, ccy)}, clean discipline`;

  // Plain-text body shared between Telegram and (lightly) the email.
  const lines: string[] = [
    `${n} trades, ${winRate}% win rate, net ${signed(net, ccy)} this week.`,
  ];
  if (biggest) {
    lines.push(
      `Biggest leak: ${biggest.label}, it cost you ${money(biggest.cost, ccy)}. ${biggest.detail}`,
    );
  } else {
    lines.push(
      'No behavioural leaks flagged this week. That is the discipline that compounds, keep it up.',
    );
  }
  if (leakCost > 0) {
    lines.push(
      `Your behavioural leaks cost ${money(leakCost, ccy)} in total. Without them, this week would have been ${signed(net + leakCost, ccy)}.`,
    );
  }

  const link = `${opts.appUrl}/dashboard`;
  const telegram = `Your week on The Trader's Hindsight\n\n${lines.join('\n\n')}\n\nFull report: ${link}`;

  const emailHtml = renderEmail({
    headline,
    bodyLines: lines,
    ctaUrl: link,
    settingsUrl: `${opts.appUrl}/settings/profile`,
  });

  return { hasContent: true, subject: headline, telegram, emailHtml };
}

function renderEmail(d: {
  headline: string;
  bodyLines: string[];
  ctaUrl: string;
  settingsUrl: string;
}): string {
  const paras = d.bodyLines
    .map(
      (l) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4b4f63;">${escapeHtml(l)}</p>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5fb;margin:0;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e8f0;">
      <tr><td style="background-color:#13131c;padding:22px 32px;"><span style="color:#ffffff;font-size:16px;font-weight:700;">The Trader's Hindsight</span></td></tr>
      <tr><td style="padding:30px 32px;">
        <h1 style="margin:0 0 18px;font-size:19px;font-weight:700;color:#13131c;">${escapeHtml(d.headline)}</h1>
        ${paras}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;"><tr>
          <td style="border-radius:10px;background-color:#5855ef;">
            <a href="${d.ctaUrl}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">See your full Hindsight Report</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #eceef5;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#9296ab;">You get this because weekly digests are on. <a href="${d.settingsUrl}" style="color:#9296ab;text-decoration:underline;">Turn them off in Settings</a>. &middot; <a href="https://tradershindsight.com" style="color:#9296ab;text-decoration:underline;">tradershindsight.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
