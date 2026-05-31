# The Trader's Hindsight — Technical Project Overview

_Last updated: May 21, 2026. Pre-launch._

This document is a complete technical description of the project: what it is,
how it's built, what's done, and what's planned. It's written to be pasted
into a chat or read by an interviewer who wants the full picture.

---

## 1. What it is

**The Trader's Hindsight** is a web-based **trading journal and analytics
platform for individual retail traders** (forex, futures, crypto, equities).
The thesis: most trading journals are passive storage; this one is built around
*review* — turning every logged trade into a lesson and compounding those
lessons into a measurable edge.

- **Domain:** tradershindsight.com
- **Positioning:** "Make your experience your edge."
- **Audience:** adults (18+) only; explicitly not targeted at minors.
- **Business model:** subscription SaaS with a 14-day free trial (no card
  required during trial), monthly or annual billing, priced in USD.
- **Operator:** solo founder, operating from Istanbul, Turkey (unincorporated
  sole trader at launch).

### Core product features
- **Multi-account tracking** — a user can run several trading accounts (Live,
  Demo, Prop Challenge, Prop Funded, Investor/Managed), each with its own
  starting balance and base currency.
- **Trade logging** — entry/exit prices, direction, P&L, risk, R-multiple,
  commission, net P&L, screenshots (before/after), notes, emotion tags.
- **Per-trade review checklists** — user-defined "setup templates" (entry
  criteria) render as checkboxes when logging or reviewing a trade.
- **Copy-trade grouping** — one setup taken across multiple accounts can be
  logged once and grouped, while each account keeps its own outcome/risk/P&L.
- **Analytics** — win rate, profit factor, R-multiple distribution, average
  win/loss, drawdown, equity curve, best/worst days.
- **Monthly performance reports** — a review-ready single page per month.
- **Dashboard** — period- and account-filterable KPI overview.

---

## 2. Tech stack

| Layer | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router, Turbopack), **React 19** |
| Language | **TypeScript** (strict) |
| Styling | **Tailwind CSS** (v3), CSS variables for theming (light/dark) |
| Data fetching | **SWR** (client cache) + Next.js **Route Handlers** (server) |
| Backend / DB | **Supabase** — Postgres 17, Auth, Storage, Row-Level Security |
| Hosting (planned) | **Vercel** (US region) |
| DB region | Supabase **ap-southeast-2** (Sydney, Australia) |
| Payments (planned) | **Flutterwave** (cards), **NOWPayments** (crypto) |
| AI (planned) | **Anthropic API** (Claude) for chatbot, insights, trade review |
| Error monitoring (planned) | **Sentry** |
| Legal docs | **Termly**-generated, hybridised into on-brand pages |

Codebase size: **~20,000 lines** of TS/TSX across ~30 routes.

---

## 3. Architecture

A clean, layered architecture that keeps UI dumb and pushes logic down:

```
React Components  (presentational; dark/light themed)
       │
Hooks (controllers)   src/hooks/use*.ts  — one per feature
       │               (useDashboard, useAnalytics, useTradeReview, …)
       │
Services (business logic)   src/lib/services/*.service.ts
       │                    (orchestrate repos, shape view models)
       │
Repositories (data access)  src/lib/db/*.repo.ts
       │                    (typed Supabase queries, one per table)
       │
Supabase (Postgres + RLS + Storage + Auth)
```

Supporting modules:
- `src/lib/supabase/client.ts` — browser Supabase client (anon key).
- `src/lib/supabase/server.ts` — server client factory; builds a request-scoped
  client from the caller's JWT (`createSupabaseWithToken`, `getToken`).
- `src/lib/supabase/auth.ts` — `getUserOrNull` / `requireUser` helpers.
- `src/lib/analytics/core.ts` — pure analytics math (date ranges, aggregates).
- `src/lib/api/fetcher.ts` — SWR fetcher.
- `src/lib/utils/` — formatting, number-safety, UI helpers.

### Two data paths
1. **Client → Route Handler → Supabase (server-side).** Heavier reads
   (dashboard, analytics, monthly report, trade view, copy/group writes) go
   through Next.js API routes that verify the JWT and run queries under RLS.
   This keeps large aggregations off the client and returns shaped view models.
2. **Client → Supabase directly (RLS-protected).** Lighter CRUD (e.g.
   submitting the contact form, account/setup management) uses the browser
   client; RLS still enforces per-user isolation.

### API Route Handlers (server-rendered on demand)
```
/api/dashboard
/api/analytics/bootstrap
/api/analytics/trades
/api/monthly-report
/api/trade-view/[id]
/api/trades/[id]
/api/trades/copy
/api/trades/group/[id]
```
Every one follows the same auth gate: `getToken(request)` → 401 if absent →
`supabase.auth.getUser()` to verify → token-scoped client for all queries.

---

## 4. Data model (Postgres / Supabase)

All tables have **Row-Level Security enabled**. Every domain table is keyed to
`auth.users(id)` and every foreign key to `auth.users` is `ON DELETE CASCADE`.

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | per-user settings | 1:1 with `auth.users`; base currency, timezone, risk %, R:R defaults |
| `accounts` | trading accounts | `account_type` enum (Live/Demo/Prop…), default flag, base currency |
| `trades` | the journal entries | prices, P&L, R-multiple, screenshots, review fields |
| `setup_templates` | entry-criteria checklists | per user, default flag |
| `setup_template_items` | checklist line items | belongs to a template |
| `trade_criteria_checks` | which items were checked per trade | composite PK (trade_id, item_id) |
| `tags` / `account_tags` | tagging | citext tag names, join table |
| `trade_groups` | copy-trade grouping | links trades taken as one setup |
| `contact_messages` | public contact-form inbox | insert-only from clients |

### Stored procedures (RPC)
- `delete_account(p_account_id)` — deletes one trading account. **SECURITY
  DEFINER**, checks `auth.uid()`, verifies ownership, refuses to delete the
  last account or one with trades.
- `set_default_account(p_account_id)` — flips the default flag. SECURITY
  DEFINER, ownership-checked.
- `delete_my_account()` — **full account self-deletion**. SECURITY DEFINER;
  wipes the caller's `storage.objects`, then deletes their `auth.users` row,
  letting cascade rules clean up every domain table. Keyed entirely to
  `auth.uid()`; `EXECUTE` granted to `authenticated` only (revoked from `anon`).
- `get_cumulative_pnl_before_date(account_id, before)` — server-side P&L
  aggregation (SECURITY INVOKER, so RLS applies); part of an analytics
  performance refactor that replaces fetch-all-and-sum on the client.

---

## 5. Security model

This is a deliberately RLS-first design and it audits clean:

- **RLS on every table.** No table is readable/writable cross-user from a
  client. Policies scope to `auth.uid()`.
- **SECURITY DEFINER functions are all authorization-checked.** Each verifies
  `auth.uid()` is present and that the target row belongs to the caller before
  mutating. No privilege-escalation path.
- **API routes verify the JWT server-side** and operate under the user's token
  (not a service-role key), so RLS still governs every query.
- **No secrets in the repo.** `.env.local` is gitignored; a repo-wide scan
  finds no service-role keys, API keys, or private keys. Client code only ever
  references the **public** `NEXT_PUBLIC_SUPABASE_ANON_KEY` and URL.
- **Account deletion** is real and immediate (cascade + storage wipe), backing
  the Privacy Policy's deletion promise; the email is freed for re-registration.
- **`contact_messages`** is insert-only for clients (validated in the RLS
  `WITH CHECK`: email shape, length caps, request-type whitelist). Only the
  operator reads it, via the Supabase dashboard / service role.

Known low-severity items (tracked, non-blocking):
- **Leaked-password protection** is off in Supabase Auth (a one-click dashboard
  toggle that checks new passwords against HaveIBeenPwned).
- Several "unused index" advisories — expected for a near-empty pre-launch DB;
  they'll be exercised once real data flows.

---

## 6. Production-readiness work completed

- **Empty states & onboarding** — reusable `EmptyState` component across
  dashboard, analytics, monthly report, settings (welcome state for new users,
  "log your first trade" state, context-aware CTAs).
- **Error handling** — global `not-found.tsx`, route-level `error.tsx`, root
  `global-error.tsx`, and trade-specific 404 when a trade id doesn't resolve.
- **Marketing landing page** — hero, "Trade → Review → Repeat → Improve" flow,
  feature grid, philosophy strip, final CTA; always-dark, SEO-friendly server
  component.
- **Brand identity** — a single "TH" monogram used consistently across favicon,
  nav mark, auth screen, and social cards; transparent PNGs (fixed an
  int16-overflow bug in the color-distance extraction by switching to int32);
  automatic OG/Twitter images via Next file conventions.
- **Legal pages** — `/privacy`, `/terms`, `/cookies`, each a hybrid of
  Termly-generated full-coverage text (GDPR/UK-GDPR, CCPA + ~20 US state laws,
  PIPEDA, Australia/NZ, South Africa POPIA, SCCs for international transfers)
  and on-brand intros; over-disclosure trimmed to match actual practice
  (one auth cookie, no ads, no tracking). A prominent "not financial advice"
  disclaimer sits in the Terms.
- **Contact** — `/contact` page + form writing to `contact_messages`
  (satisfies multi-channel contact requirements for several US state laws).
- **Settings hub** — `/settings` index with cards routing to Profile, Trading
  Accounts, and Setup Templates.
- **DPA tracking** — `docs/processor-dpas.md` records GDPR Art. 28 coverage for
  every third-party processor.

---

## 7. Roadmap (planned)

**Next up — AI features (the launch differentiator):**
1. **Help chatbot** — answers product/usage questions.
2. **AI insights** — narrates statistical patterns in a user's own trade history
   ("you lose on Fridays after 2pm"); SQL aggregations + an LLM that explains
   them in plain English.
3. **Per-trade AI review** — surfaces what stands out about a single trade.

All three run on the **Anthropic API** under a no-training agreement, **opt-in**
(off by default, toggled in settings), server-side only (API key never client),
and disclosed in the Privacy Policy.

**Other planned work:**
- Payment integration (Flutterwave + NOWPayments) and subscription gating.
- Transactional email (trial-ending, renewal, security alerts).
- Sentry error monitoring.
- CSV export of trades (promised in the Privacy Policy).
- Mobile responsiveness pass.
- A dedicated **mobile app** (separate product surface; its own privacy policy
  and EULA when built — deliberately not folded into the web policy now).
- Appoint an **EU/UK GDPR representative** once EU/UK paid revenue justifies it.

---

## 8. Engineering decisions worth talking about

- **Layered architecture (Components → Hooks → Services → Repos).** Keeps
  business logic testable and UI replaceable; the repo layer is the only thing
  that knows about Supabase.
- **RLS-first security** rather than trusting the application layer — even the
  server API routes run under the user's JWT so the database is the final
  arbiter of access.
- **Server-side aggregation RPC** (`get_cumulative_pnl_before_date`) to replace
  a client-side fetch-all-and-sum — moves heavy math to Postgres and returns
  one number over the wire.
- **Cascade-based account deletion** — instead of manually deleting from a dozen
  tables, lean on `ON DELETE CASCADE` from `auth.users` and only hand-wipe what
  doesn't cascade (storage objects).
- **The int16 overflow bug** in logo extraction — color distance `244² = 59,536`
  silently wrapped a signed 16-bit accumulator, producing wireframe-only output;
  fixed by computing distances in int32. A nice "know your numeric types" story.
- **Termly hybrid legal approach** — full multi-jurisdiction coverage from a
  generator, then trimmed to reflect what the product actually does, preserving
  brand voice and a domain-specific risk disclaimer.
- **Nigerian/Turkish operator payment constraints** — Stripe/PayPal don't cleanly
  support the operator's situation, so the stack settles on Flutterwave (naira
  payout) + NOWPayments (crypto), a real-world constraint-driven decision.

---

## 9. Current status

- **Build:** `next build` passes (30 routes, clean).
- **Types:** `tsc --noEmit` clean.
- **Lint:** `eslint` clean.
- **Security:** Supabase advisors reviewed; no real vulnerabilities; two
  low-severity hygiene items noted (leaked-password toggle, unused-index noise).
- **Stage:** pre-launch. Legal docs published in Termly; AI features and
  payments are the remaining build before public launch.
