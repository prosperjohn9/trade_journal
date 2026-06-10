# Sync + AI cost model (FINAL, locked 2026-06-06)

The economics behind the paid tiers. All MetaApi rates below are **confirmed from
the account's own billing page** (plan: paid, generation **cloud-g2**). All
Anthropic rates are the published 2026 prices for the model the app uses
(`claude-opus-4-8`).

## Confirmed unit costs

### MetaApi (cloud-g2, the generation we use)
| Item | Rate | Notes |
|---|---|---|
| Deployed hosting | $0.0126 / account / hour | only while deployed |
| **Per deployment** | **$0.0756** | **6-hour minimum billed on every deploy** |
| Undeployed hosting | $0.00105 / account / hour = **$0.756 / account / month** | account exists but stopped |
| **Raw history (MetaApi API)** | **$0 / account / hour** | what we will use instead of MetaStats |
| MetaStats API | $0.001575 / account / hour | **dropped** (cost + billing uncertainty) |
| Adding an account | $2.10 / account, once | deduped monthly; amortizes to ~$0.18/mo |

**The governing fact:** you are billed a **6-hour minimum every time you deploy**.
So cost is driven purely by the number of deploys, not their length:

> MetaApi cost / account / month = (deploys per day x 30 x $0.0756) + $0.756 undeployed

- 1 deploy/day  = $2.27 + $0.756 = **$3.02 / account / month**
- 2 deploys/day = $4.54 + $0.756 = **$5.30 / account / month**

Deploying more often than ~4x/day costs more than just leaving it deployed 24/7
($9.07/mo), so we never sync more than once or twice a day.

### Anthropic (claude-opus-4-8, $5 / $25 per 1M tokens in/out)
Output caps in code: trade review 1200, insights 1500, chat 1024 tokens.
System prompts are cached (90% off on repeat). Blended cost per AI action:
- typical output: **~$0.035 / action**
- max output: **~$0.05 / action** (used for the worst-case table below)

"1 AI action" = one generation: one trade review, OR one insight refresh, OR one
chat reply. Reading an already-generated result is free.

## Key decision: drop MetaStats, pair raw deals ourselves
MetaStats is convenient (pre-paired trades) but costs $0.001575/hr/account with an
unclear billing window (continuous vs deployed-only). At 8 accounts that swing is
~$9/month and can push Master into a loss. The **raw MetaApi history API is free**,
so we fetch raw deals and pair them into round-trip trades in our own code. This
removes the cost AND the uncertainty. Build cost: a sync rewrite (handle partial
fills / hedged positions when pairing by position id).

## Final tiers (LOCKED)
Auto-sync is **once daily for every tier** (6-hour deploy billing makes anything
faster uneconomical; the manual refresh button covers "I want it now"). Tiers
differ by **account count + AI quota + manual-refresh allowance**. AI stays Opus.

| | Pro $18 | Elite $28 | Master $48 |
|---|---|---|---|
| Included synced accounts | 2 | 4 | 8 |
| Auto-sync | 1x / day | 1x / day | 1x / day |
| Manual refreshes (per account) | 14 / mo | 28 / mo | 48 / mo |
| AI actions (Opus) | 40 | 100 | 200 |
| Extra synced account (PAYG) | **$6 / mo** (cost ~$3) |

Annual = monthly x 10 (2 months free): Pro $180, Elite $280, Master $480.

## Worst-case P&L (every account synced daily + full manual + AI maxed at top output)
Payment fee assumed ~4.5% (Flutterwave card).

| Tier | Deploys/mo | MetaApi | AI | Fee | Total cost | Revenue | Profit | Margin |
|---|---|---|---|---|---|---|---|---|
| Pro | 75 | $7.18 | $2.00 | $0.81 | $9.99 | $18 | **$8.01** | **45%** |
| Elite | 150 | $14.36 | $5.00 | $1.26 | $20.62 | $28 | **$7.38** | **26%** |
| Master | 290 | $27.97 | $10.00 | $2.16 | $40.13 | $48 | **$7.87** | **16%** |

MetaApi = deploys x $0.0756 + accounts x $0.756. This is the **floor**. Typical
usage (not every account active daily, manual rarely maxed, AI ~half used, output
below cap) lands roughly **Pro ~65% / Elite ~50% / Master ~40%**.

### Flags to revisit
- **Annual Master**: 2 months free (x10) makes the worst case roughly break-even.
  Consider x11 (1 month free) for Master, or accept it (annual users commit; typical
  usage carries margin).
- **PAYG extra account**: raise `EXTRA_SYNC_PRICE_MONTHLY` 4 -> 6 (each extra
  account costs ~$3/mo; $4 was only ~24% margin).

## Two hard cost guards (build these into enforcement)
1. **Auto-sync only accounts with recent activity** (e.g. user logged in / viewed the
   account in the last N days). Never pay to deploy an idle account.
2. **Meter manual refreshes** against the monthly allowance. Each manual refresh is a
   real $0.0756 deploy.

## Build plan (tomorrow)
1. **Deploy-on-demand** in the sync path: deploy -> poll until synchronized -> fetch
   raw history -> undeploy. One deploy per refresh. Respect the 60s serverless limit
   (if a deploy is slow, return and let the next cron tick finish it).
2. **Rewrite the fetch** from MetaStats (`fetchHistoricalTrades`) to raw MetaApi deal
   history + our own position-pairing. Keep `mapTradeToRow` output shape.
3. **Cron**: per-tier daily due-check (replace the 4h/2h/1h interval logic), skip
   idle accounts, deploy-on-demand each due account.
4. **Plan catalog** (`plans.ts`): accounts 2/4/8, `syncIntervalHours` 24 all tiers,
   AI 40/100/200, add `manualRefreshesPerMonth` 15/30/50, PAYG -> $6.
5. **AI quota enforcement**: count actions in the current billing month, block over
   quota with a styled upgrade prompt (the daily cap of 50 stays as a backstop).
6. **Manual-refresh metering**: per-account monthly counter, enforced in the manual
   sync route.
7. **Pricing/billing copy**: replace "sync every 4h/2h/1h" with "daily auto-sync +
   N on-demand refreshes". Update account counts.
8. **Enforcement UX polish**: styled upgrade prompts when a gate (sync off, account
   limit, AI quota, manual-refresh cap) is hit.
