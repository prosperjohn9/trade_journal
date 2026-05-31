'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, apiPost } from '@/src/lib/api/fetcher';

type ReviewResponse = {
  review: string | null;
  model?: string;
  cached?: boolean;
  updated_at?: string | null;
};

/**
 * Minimal renderer for the model's Markdown: bold `**Heading**` lines become
 * subheadings, `- ` lines become bullets, stray `**` is stripped. Avoids
 * pulling in a Markdown dependency for three predictable sections.
 */
function ReviewBody({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul
        key={`ul-${key}`}
        className='list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]'>
        {bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flush(String(i));
      return;
    }
    const heading = line.match(/^\*\*(.+?)\*\*:?$/);
    if (heading) {
      flush(String(i));
      blocks.push(
        <p key={i} className='text-sm font-semibold text-[var(--text-primary)]'>
          {heading[1]}
        </p>,
      );
      return;
    }
    if (/^[-*•]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s+/, '').replace(/\*\*/g, ''));
      return;
    }
    flush(String(i));
    blocks.push(
      <p key={i} className='text-sm text-[var(--text-secondary)]'>
        {line.replace(/\*\*/g, '')}
      </p>,
    );
  });
  flush('end');

  return <div className='space-y-3'>{blocks}</div>;
}

export function TradeAiReview({ tradeId }: { tradeId: string }) {
  const [review, setReview] = useState<string | null>(null);
  const [checking, setChecking] = useState(true); // initial (free) cached lookup
  const [loading, setLoading] = useState(false); // a paid generate/regenerate
  const [error, setError] = useState<string | null>(null);

  // Look up an existing review on mount. This is the GET endpoint — read-only,
  // never spends credits — so opening a trade never triggers a generation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<ReviewResponse>(
          `/api/ai/trade-review?tradeId=${encodeURIComponent(tradeId)}`,
        );
        if (!cancelled && data.review) setReview(data.review);
      } catch {
        // Non-fatal — the user can still generate one.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tradeId]);

  async function generate(regenerate: boolean) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<ReviewResponse>('/api/ai/trade-review', {
        tradeId,
        regenerate,
      });
      if (data.review) setReview(data.review);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a review.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-5 sm:p-6'>
      <h2 className='text-xl font-semibold'>AI Review</h2>

      <div className='mt-4'>
        {checking ? (
          <p className='text-sm text-[var(--text-muted)]'>Loading...</p>
        ) : review ? (
          <ReviewBody text={review} />
        ) : (
          <div className='space-y-3'>
            <p className='text-sm text-[var(--text-secondary)]'>
              Get an objective, process-focused read on this trade: what you did
              well, what to watch, and one habit for next time.
            </p>
            <button
              type='button'
              onClick={() => generate(false)}
              disabled={loading}
              className='inline-flex items-center rounded-lg border border-transparent bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'>
              {loading ? 'Analyzing...' : 'Generate AI review'}
            </button>
          </div>
        )}

        {error ? <p className='mt-3 text-sm text-[var(--loss)]'>{error}</p> : null}

        {review ? (
          <p className='mt-4 border-t border-[var(--border-default)] pt-3 text-xs text-[var(--text-muted)]'>
            AI-generated coaching from your own journal data. Educational only,
            not financial advice.
          </p>
        ) : null}
      </div>
    </section>
  );
}
