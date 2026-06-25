# Sync + AI cost model

Provenance: unit costs locked **2026-06-06** (confirmed from the MetaApi account's
own billing page, plan: paid, generation **cloud-g2**). Tiers and the AI cost
figure **refreshed 2026-06-25** to the current locked model (Pro $12 / Elite $18 /
Master $28, MetaTrader **1 / 1 / 2**). This supersedes the old $18/$28/$48 ·
2/4/8-account model and the old $0.035-0.05 AI estimate.

## Confirmed unit costs

### MetaApi (cloud-g2, the generation we use)
| Item | Rate | Notes |
|---|---|---|
| Deployed hosting | $0.0126 / account / hour | only while deployed |
| **Per deployment** | **$0.0756** | **6-hour minimum billed on every deploy** |
| Undeployed hosting | $0.00105 / account / hour = **$0.756 / account / month** | account exists but stopped |
| **Raw history (MetaApi API)** | **$0 / account / hour** | what we use instead of MetaStats |
| MetaStats API | $0.001575 / account / hour | **dropped** (cost + billing uncertainty) |
| Adding an account | $2.10 / account, once | deduped monthly, amortizes to ~$0.18/mo |

**The governing fact:** you are billed a **6-hour minimum every time you deploy**,
so cost is driven by the number of deploys, not their length:

> MetaApi / account / month = (deploys/day x 30 x $0.0756) + $0.756 undeployed

- 1 deploy/day (our daily auto-sync) = $2.27 + $0.756 = **$3.02 / account / month**
- 2 deploys/day = $4.54 + $0.756 = **$5.30 / account / month**
- always-deployed 24/7 (Foresight guardrail) = $0.0126 x 730 = **~$9.20 / month**

Deploying more than ~4x/day costs more than leaving it deployed 24/7, so auto-sync
is once daily and the manual-refresh button (each one a real $0.0756 deploy) covers
"I want it now".

### Anthropic (claude-opus-4-8, $5 / $25 per 1M tokens in/out)
Output caps in code: trade review 1200, insights 1500, chat 1024 tokens. System
prompts are cached (90% off on repeat).

**Measured cost per AI action** (2026-06-25, from 79 logged `ai_usage` calls, cost
computed from token counts at $5/$25 in/out, $0.50 cache-read, $6.25 cache-write):

| Feature | avg | worst (p95/max) |
|---|---|---|
| insights | $0.021 | $0.023 |
| guard (Foresight read) | $0.017 | $0.023 |
| trade_review | $0.013 | $0.014 |
| chat | $0.007 | $0.013 |
| **all** | **$0.015** | **$0.023** |

This is the real distribution and **supersedes the old $0.035-0.05 estimate** (which
assumed near-max output every call) and the earlier 31-call $0.011 sample. The
worst-case table below uses **$0.023/action**.

"1 AI action" = one generation (one trade review, one insight refresh, or one chat
reply). Reading an already-generated result is free.

## Why we pair raw deals (drop MetaStats)
MetaStats is convenient (pre-paired trades) but costs $0.001575/hr/account with an
unclear billing window. The **raw MetaApi history API is free**, so we fetch raw
deals and pair them into round-trip trades in our own code (`buildFromDeals`,
position-id pairing). Removes the cost and the billing uncertainty.

## Tiers (LOCKED 2026-06-25)
Auto-sync is **once daily** for every tier. Tiers differ on four axes: MetaTrader
accounts, AI quota, manual-refresh allowance, and free cTrader Foresight reads.
cTrader auto-sync, file import, and manual accounts are unlimited on every tier
(all ~$0 marginal cost, and our positioning wedge). AI stays Opus.

| | Pro $12 | Elite $18 | Master $28 |
|---|---|---|---|
| Included **MetaTrader** accounts | 1 | 1 | **2** |
| cTrader auto-sync | unlimited, free | unlimited, free | unlimited, free |
| File import | unlimited, free | unlimited, free | unlimited, free |
| Manual accounts | unlimited | unlimited | unlimited |
| Auto-sync | 1x / day | 1x / day | 1x / day |
| Manual refreshes | 14 / mo | 28 / mo | 48 / mo |
| AI actions (Opus) | 40 | 100 | 200 |
| Free cTrader Foresight reads | 80 / mo | 200 / mo | 600 / mo |

Annual = monthly x 10 (2 months free): Pro $120, Elite $180, Master $280.

**Add-ons (per account / month):** extra MetaTrader auto-sync **$6** (cost ~$3),
MetaTrader Foresight / Live Guard **$18** (always-deployed MetaApi ~$9.20). cTrader
Foresight is free (Spotware streaming has no per-account fee).

**MetaTrader is the only real per-user cost driver** (~$3/account/mo), so it is the
premium lever. Rejected alternatives: **1/2/4** (Master falls to 20% worst-case /
38% typical, would need ~$49 to hold the current margin); capping cTrader sync /
file imports / manual accounts (all ~$0 cost, and file import is the trial-conversion
tool, capping it walls a new user off from their own data).

## Worst-case P&L
Every bundled MetaTrader account synced daily + manual refreshes maxed + AI quota
maxed at top output ($0.023/action) + card fee 4.5% (Flutterwave). This is the
**floor**; almost no subscriber hits it.

| Tier | MT | Deploys/mo | MetaApi | AI | Fee | Total cost | Revenue | **Profit** | Margin |
|---|---|---|---|---|---|---|---|---|---|
| Pro | 1 | 44 | $4.26 | $0.92 | $0.54 | $5.72 | $12 | **$6.28** | 52% |
| Elite | 1 | 58 | $5.32 | $2.30 | $0.81 | $8.43 | $18 | **$9.57** | 53% |
| Master | 2 | 108 | $10.04 | $4.60 | $1.26 | $15.90 | $28 | **$12.10** | 43% |

MetaApi = deploys x $0.0756 + accounts x $0.756 + accounts x $0.18 (add-account
amortized). Deploys = accounts x 30 (daily) + manual-refresh allowance.

- **Typical** (half AI/refreshes used, output below cap): ~Pro 62% / Elite 68% /
  Master 61%.
- **Crypto** (NOWPayments 0.5% instead of card 4.5%): adds ~$0.48 / $0.72 / $1.12
  back per subscriber. Crypto is currently the only live processor, so real margins
  are above the table.
- **Annual** (x10): the thinner case, still positive, ~$4.4 / $6.7 / $7.6 profit
  per month-equivalent.

## Fixed overhead ("running the business")
~$9 / month at launch (Railway Foresight worker ~$8 + domain ~$1; Vercel, Supabase,
Resend on free tiers) scaling to ~$54 / month on paid tiers (Vercel Pro $20 +
Supabase Pro $25 + Railway $8 + domain $1). Spread across all subscribers it is
trivial: 3-5 paying subs cover it, and past ~100 subs it is under $0.55/sub. It does
not change the per-tier math, the per-account variable cost does.

## Two cost guards (built into enforcement)
1. **Auto-sync only recently-active accounts** (idle accounts back off to weekly).
   Never pay to deploy a dormant account. (`sync.ts` cron due-check.)
2. **Meter manual refreshes** against the monthly allowance (`mt_refreshes` table).
   Each manual refresh is a real $0.0756 deploy.

Plus `enforceSyncCaps()` each cron tick: if a user's synced-account entitlement drops
below their connected MetaTrader count (downgrade / add-on lapse / sub expiry), keep
the oldest `limit` accounts and suspend the rest (remove the MetaApi account, state
`over_limit`) so we never pay for accounts above the cap.
