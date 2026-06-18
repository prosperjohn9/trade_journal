# Foresight worker

The always-on half of Live Guard. It watches every MetaTrader account that has
Foresight enabled and, the instant a trade opens, asks the app for a read that
gets pushed to the trader's Telegram. It also re-reads when a stop or target is
moved, and closes the loop when a position exits.

## How it fits together

```
 MetaTrader account  ──poll positions──▶  worker  ──HTTPS (x-worker-secret)──▶  app
                                                                                 │
                                          analyze + AI + Telegram + DB  ◀────────┘
```

The worker is intentionally thin. It holds **no** AI key, **no** Telegram token,
and **no** database credentials. It only:

1. `GET /api/guard/accounts` to learn which accounts to watch.
2. Keeps those accounts deployed and polls their open positions.
3. Calls `POST /api/guard/analyze` on a new or modified position.
4. Calls `POST /api/guard/close` when a position disappears.

All judgment (the analyzer, the AI narration, Telegram delivery, the read log)
lives in the app and is reused verbatim, so the worker can never drift from what
the on-demand Foresight does.

## Environment

Copy `.env.example` and fill in:

| Var | What |
| --- | --- |
| `APP_URL` | The deployed app, e.g. `https://tradershindsight.com` |
| `WORKER_SECRET` | Shared secret; must equal `WORKER_SECRET` in the app (Vercel) |
| `METAAPI_TOKEN` | The MetaApi app token (same one the app uses) |
| `POLL_INTERVAL_SECONDS` | Optional, default 12 |
| `REFRESH_ACCOUNTS_SECONDS` | Optional, default 120 |
| `MODIFY_COOLDOWN_SECONDS` | Optional, default 300 (min gap between AI re-reads of the same position) |

## Run locally

```bash
cd worker
npm install
cp .env.example .env   # then fill it in
npm start
```

## Deploy on Railway

1. New Project → **Deploy from GitHub repo** → pick this repo.
2. In the service settings set **Root Directory** to `worker`.
3. Railway auto-detects Node and runs `npm install` then `npm start`.
4. Add the variables from the table above under **Variables**.
5. Deploy. Watch the logs: you should see `watching N guarded account(s)`.

No public port is needed; this is a background worker, not a web service.

## Notes

- On start (or restart) the worker **seeds** each account's currently-open
  positions silently, so it only alerts on trades opened from then on. A restart
  will not re-alert open trades.
- When Foresight is turned off for an account (or it breaches / exceeds the
  synced-account cap), the account drops off `GET /api/guard/accounts` and the
  worker undeploys it to stop billing.
- Detection latency is one poll interval (~12s). Good enough for an entry
  co-pilot; a streaming upgrade can come later if needed.
