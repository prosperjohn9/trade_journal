'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiPost, isUpgradeError } from '@/src/lib/api/fetcher';
import { AiMarkdown } from '@/src/components/ui/AiMarkdown';
import { UpgradePrompt } from '@/src/components/ui/UpgradePrompt';

type InsightsResponse = {
  insights: string | null;
  model?: string | null;
  generatedAt?: string | null;
  tradeCount?: number;
  canGenerate?: boolean;
  stale?: boolean;
  minTrades?: number;
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AiInsightsCard() {
  const [insights, setInsights] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [tradeCount, setTradeCount] = useState(0);
  const [minTrades, setMinTrades] = useState(10);
  const [checking, setChecking] = useState(true); // initial (free) GET
  const [loading, setLoading] = useState(false); // a paid generate/refresh
  const [error, setError] = useState<string | null>(null);
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);

  // Explicit first-time generation (button). Subsequent refreshes are automatic
  // (handled in the effect when insights exist and have gone stale).
  async function generate() {
    setLoading(true);
    setError(null);
    setUpgradeMsg(null);
    try {
      const data = await apiPost<InsightsResponse>('/api/ai/insights', {});
      if (data.insights) {
        setInsights(data.insights);
        setGeneratedAt(data.generatedAt ?? new Date().toISOString());
      }
    } catch (e) {
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setError(e instanceof Error ? e.message : 'Could not generate insights.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let shouldRefresh = false;
      try {
        const data = await apiFetch<InsightsResponse>('/api/ai/insights');
        if (cancelled) return;
        setInsights(data.insights ?? null);
        setGeneratedAt(data.generatedAt ?? null);
        setCanGenerate(Boolean(data.canGenerate));
        setTradeCount(data.tradeCount ?? 0);
        setMinTrades(data.minTrades ?? 10);
        // Auto-refresh only when insights already exist and have gone stale
        // (>= 4 trades changed). The very first insight stays an explicit click.
        shouldRefresh = Boolean(data.canGenerate && data.insights && data.stale);
      } catch {
        // Ignore — the UI falls back to the generate/empty state.
      } finally {
        if (!cancelled) setChecking(false);
      }

      if (!cancelled && shouldRefresh) {
        setLoading(true);
        try {
          const fresh = await apiPost<InsightsResponse>('/api/ai/insights', {});
          if (!cancelled && fresh.insights) {
            setInsights(fresh.insights);
            setGeneratedAt(fresh.generatedAt ?? new Date().toISOString());
          }
        } catch (e) {
          if (!cancelled) {
            if (isUpgradeError(e)) setUpgradeMsg(e.message);
            else setError(e instanceof Error ? e.message : 'Could not refresh insights.');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className='border rounded-xl p-4 bg-[var(--bg-surface)] border-[var(--border-default)] space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h2 className='text-lg font-semibold'>AI Insights</h2>
          <p className='text-xs text-[var(--text-muted)]'>
            Your AI coach reads the whole journal: your edge, your habits, and
            the one pattern to break.
          </p>
        </div>
        {insights ? (
          <span className='text-xs text-[var(--text-muted)]'>
            {loading ? 'Refreshing...' : `Updated ${timeAgo(generatedAt)}`}
          </span>
        ) : null}
      </div>

      {checking ? (
        <p className='text-sm text-[var(--text-muted)]'>Loading...</p>
      ) : !canGenerate ? (
        <p className='text-sm text-[var(--text-secondary)]'>
          Add at least {minTrades} trades to unlock AI insights. You have{' '}
          {tradeCount}.
        </p>
      ) : insights ? (
        <AiMarkdown text={insights} />
      ) : loading ? (
        <p className='text-sm text-[var(--text-muted)]'>Analyzing your trades...</p>
      ) : (
        <div className='space-y-3'>
          <p className='text-sm text-[var(--text-secondary)]'>
            A behavioural read on your whole journal — where your edge is, the
            single most costly leak (revenge trading, session decay, holding
            losers too long), and the one pattern to break. Refreshes
            automatically as you trade.
          </p>
          <button
            type='button'
            onClick={generate}
            disabled={loading}
            className='inline-flex items-center rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'>
            {loading ? 'Analyzing...' : 'Generate insights'}
          </button>
        </div>
      )}

      {upgradeMsg ? <UpgradePrompt message={upgradeMsg} /> : null}
      {error ? <p className='text-sm text-[var(--loss)]'>{error}</p> : null}

      {insights ? (
        <p className='border-t border-[var(--border-default)] pt-3 text-xs text-[var(--text-muted)]'>
          AI read of your trading behaviour. Educational only, not financial
          advice.
        </p>
      ) : null}
    </section>
  );
}
