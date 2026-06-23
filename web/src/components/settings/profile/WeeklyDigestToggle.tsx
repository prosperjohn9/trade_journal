'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Settings for the proactive updates: the weekly Hindsight digest, the daily news
// briefing, and which currencies that briefing should cover. Reads/writes the
// profiles fields directly under RLS, so it stays out of the shared profile form.

type Flags = {
  weekly_digest_enabled: boolean;
  news_briefing_enabled: boolean;
};

const DEFAULTS: Flags = {
  weekly_digest_enabled: true,
  news_briefing_enabled: true,
};

// The currencies Forex Factory tracks high-impact events for.
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

export function WeeklyDigestToggle() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('profiles')
        .select(
          'weekly_digest_enabled, news_briefing_enabled, news_briefing_currencies',
        )
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        const d = (data ?? {}) as Partial<Flags> & {
          news_briefing_currencies?: string[] | null;
        };
        setFlags({
          weekly_digest_enabled: d.weekly_digest_enabled ?? true,
          news_briefing_enabled: d.news_briefing_enabled ?? true,
        });
        setCurrencies(d.news_briefing_currencies ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setFlag(key: keyof Flags, value: boolean) {
    if (!flags) return;
    setSaving(true);
    setFlags({ ...flags, [key]: value });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ [key]: value }).eq('id', user.id);
    }
    setSaving(false);
  }

  async function toggleCurrency(ccy: string) {
    const next = currencies.includes(ccy)
      ? currencies.filter((c) => c !== ccy)
      : [...currencies, ccy];
    setCurrencies(next);
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ news_briefing_currencies: next.length ? next : null })
        .eq('id', user.id);
    }
    setSaving(false);
  }

  const f = flags ?? DEFAULTS;
  const disabled = flags === null || saving;

  return (
    <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
        Email &amp; Telegram updates
      </h2>

      <label className='flex items-center justify-between gap-3'>
        <span>
          <span className='font-medium text-[var(--text-primary)]'>
            Weekly Hindsight digest
          </span>
          <span className='mt-0.5 block text-xs text-[var(--text-secondary)]'>
            A Monday recap of last week&apos;s behavioural leaks and net result,
            to your Telegram and email.
          </span>
        </span>
        <input
          type='checkbox'
          className='h-4 w-4 shrink-0'
          checked={f.weekly_digest_enabled}
          onChange={(e) => void setFlag('weekly_digest_enabled', e.target.checked)}
          disabled={disabled}
        />
      </label>

      <label className='flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-4'>
        <span>
          <span className='font-medium text-[var(--text-primary)]'>
            Daily news briefing
          </span>
          <span className='mt-0.5 block text-xs text-[var(--text-secondary)]'>
            Each morning, today&apos;s high-impact events for your chosen
            currencies, to your Telegram. (Requires Telegram linked above.)
          </span>
        </span>
        <input
          type='checkbox'
          className='h-4 w-4 shrink-0'
          checked={f.news_briefing_enabled}
          onChange={(e) => void setFlag('news_briefing_enabled', e.target.checked)}
          disabled={disabled}
        />
      </label>

      {f.news_briefing_enabled ? (
        <div className='border-t border-[var(--border-default)] pt-4'>
          <p className='text-xs text-[var(--text-secondary)]'>
            Currencies to cover in your briefing. Leave all off to auto-pick from
            the pairs you&apos;ve traded.
          </p>
          <div className='mt-2.5 flex flex-wrap gap-2'>
            {CURRENCIES.map((c) => {
              const on = currencies.includes(c);
              return (
                <button
                  key={c}
                  type='button'
                  onClick={() => void toggleCurrency(c)}
                  disabled={disabled}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                    on
                      ? 'text-white'
                      : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  style={
                    on
                      ? {
                          backgroundColor: 'var(--accent)',
                          borderColor: 'var(--accent)',
                        }
                      : undefined
                  }>
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
