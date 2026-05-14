# TradersHindsight

> Hindsight is 20/20. Now you can keep it.

The trading journal built for traders who refuse to repeat their mistakes. Log every trade, review every decision, and turn experience into edge.

## Features

- Log single trades or copy trades across multiple accounts in one shot
- Setup-based checklists so you grade your own execution
- Per-account starting balances, P&L, R-multiples, equity curves
- Full analytics page (win rate, profit factor, sharpe, session breakdown, drawdown context)
- Monthly performance reports
- Before/after trade screenshots stored privately with signed URLs

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19
- Supabase (Postgres + Auth + Storage + RLS)
- TypeScript, Tailwind, SWR

## Local development

```bash
cd web
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open <http://localhost:3000>.
