'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Opt-outs for the proactive updates (weekly Hindsight digest + daily news
// briefing). Reads/writes the profiles flags directly under RLS, so it stays out
// of the shared profile form.

type Flags = {
  weekly_digest_enabled: boolean;
  news_briefing_enabled: boolean;
};

const DEFAULTS: Flags = {
  weekly_digest_enabled: true,
  news_briefing_enabled: true,
};

export function WeeklyDigestToggle() {
  const [flags, setFlags] = useState<Flags | null>(null);
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
        .select('weekly_digest_enabled, news_briefing_enabled')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        const d = (data ?? {}) as Partial<Flags>;
        setFlags({
          weekly_digest_enabled: d.weekly_digest_enabled ?? true,
          news_briefing_enabled: d.news_briefing_enabled ?? true,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function set(key: keyof Flags, value: boolean) {
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
          onChange={(e) => void set('weekly_digest_enabled', e.target.checked)}
          disabled={disabled}
        />
      </label>

      <label className='flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-4'>
        <span>
          <span className='font-medium text-[var(--text-primary)]'>
            Daily news briefing
          </span>
          <span className='mt-0.5 block text-xs text-[var(--text-secondary)]'>
            Each morning, today&apos;s high-impact events for the pairs you trade,
            to your Telegram. (Requires Telegram linked above.)
          </span>
        </span>
        <input
          type='checkbox'
          className='h-4 w-4 shrink-0'
          checked={f.news_briefing_enabled}
          onChange={(e) => void set('news_briefing_enabled', e.target.checked)}
          disabled={disabled}
        />
      </label>
    </section>
  );
}
