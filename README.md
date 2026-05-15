# The Trader's Hindsight

> Make your experience your edge.

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

## Troubleshooting

### "Turbopack error" / "Module not found" / dev hangs silently

This is almost always caused by **macOS file-conflict duplicates** (files ending in `" 2"`, `" 3"`) inside `node_modules/` or `.next/`. They originate from iCloud Drive, Finder copy operations, or two `npm install` processes racing. Turbopack panics when it sees duplicate cache files; `npm` silently leaves partial installs when duplicates pile up.

Diagnose:

```bash
cd web
npm run doctor          # counts " 2"-suffix files in the project
```

Fix:

```bash
cd web
npm run clean           # nukes .next, node_modules, lockfile, and " 2" duplicates
npm install
npm run dev
```

To prevent recurrence, **don't keep the project inside `~/Desktop` or `~/Documents`** (both are synced to iCloud Drive by default on modern macOS). Move it to `~/dev/the-traders-hindsight` or any folder that's not under iCloud sync.
