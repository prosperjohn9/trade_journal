'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';

// Opt-out for the weekly Hindsight digest (email + Telegram). Reads/writes
// profiles.weekly_digest_enabled directly under RLS, so it stays out of the
// shared profile form.

export function WeeklyDigestToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
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
        .select('weekly_digest_enabled')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setEnabled(
          (data as { weekly_digest_enabled?: boolean } | null)
            ?.weekly_digest_enabled ?? true,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setEnabled(next);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ weekly_digest_enabled: next })
        .eq('id', user.id);
    }
    setSaving(false);
  }

  return (
    <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
        Weekly digest
      </h2>
      <label className='mt-4 flex items-center justify-between gap-3'>
        <span>
          <span className='font-medium text-[var(--text-primary)]'>
            Weekly Hindsight digest
          </span>
          <span className='mt-0.5 block text-xs text-[var(--text-secondary)]'>
            A short Monday recap of last week&apos;s behavioural leaks and net
            result, sent to your Telegram and email.
          </span>
        </span>
        <input
          type='checkbox'
          className='h-4 w-4 shrink-0'
          checked={enabled ?? true}
          onChange={(e) => void toggle(e.target.checked)}
          disabled={enabled === null || saving}
        />
      </label>
    </section>
  );
}
