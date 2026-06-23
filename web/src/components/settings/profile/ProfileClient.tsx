'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { getOrCreateProfile, updateProfile } from '@/src/lib/db/profiles.repo';
import { DeleteAccountModal } from './DeleteAccountModal';
import { ExportTradesButton } from './ExportTradesButton';
import { ConnectTelegram } from './ConnectTelegram';
import { WeeklyDigestToggle } from './WeeklyDigestToggle';

type DashboardTheme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'dashboard-theme';

// Used to mask the inline "Saved" / "Failed..." status next to the field.
const STATUS_CLEAR_MS = 2000;

export function ProfileClient() {
  const router = useRouter();
  const [theme, setTheme] = useState<DashboardTheme>('light');
  const [email, setEmail] = useState<string | null>(null);

  // Display name editing — moved here from the old inline form on /dashboard
  // so that all profile management lives in one place.
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Trading defaults (risk per trade + target reward-to-risk). Used by the trade
  // form, Foresight, and analytics; had no UI before.
  const [riskDraft, setRiskDraft] = useState('');
  const [rrDraft, setRrDraft] = useState('');
  const [savingTrading, setSavingTrading] = useState(false);
  const [tradingStatus, setTradingStatus] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
        return;
      }

      const prefersDark = window.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      setTheme(prefersDark ? 'dark' : 'light');
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        router.replace('/auth');
        return;
      }
      setEmail(data.user.email ?? null);

      // Load profile to populate the display name draft.
      try {
        const { profile } = await getOrCreateProfile();
        if (cancelled) return;
        setDisplayNameDraft(profile.display_name ?? '');
        const td = profile as {
          risk_per_trade_percent?: number | null;
          rr_win?: number | null;
        };
        setRiskDraft(
          td.risk_per_trade_percent != null
            ? String(td.risk_per_trade_percent)
            : '',
        );
        setRrDraft(td.rr_win != null ? String(td.rr_win) : '');
      } catch (e) {
        // Non-fatal — the user can still see the account and danger zone.
        console.error('Failed to load profile:', e);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatusMessage('Saving...');

    try {
      const trimmed = displayNameDraft.trim();
      const updated = await updateProfile({
        display_name: trimmed || null,
      });
      setDisplayNameDraft(updated.display_name ?? '');
      setStatusMessage('Saved');
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : 'Failed to save display name';
      setStatusMessage(message);
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatusMessage(''), STATUS_CLEAR_MS);
    }
  }

  async function handleSaveTradingDefaults(e: React.FormEvent) {
    e.preventDefault();
    setSavingTrading(true);
    setTradingStatus('Saving...');
    try {
      const risk = Number(riskDraft);
      const rr = Number(rrDraft);
      await updateProfile({
        risk_per_trade_percent:
          riskDraft.trim() !== '' && Number.isFinite(risk) && risk > 0
            ? risk
            : null,
        rr_win:
          rrDraft.trim() !== '' && Number.isFinite(rr) && rr > 0 ? rr : null,
      });
      setTradingStatus('Saved');
    } catch (e: unknown) {
      setTradingStatus(
        e instanceof Error ? e.message : 'Failed to save trading defaults',
      );
    } finally {
      setSavingTrading(false);
      window.setTimeout(() => setTradingStatus(''), STATUS_CLEAR_MS);
    }
  }

  return (
    <main
      className='dashboard-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]'
      data-theme={theme}>
      <div className='mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8'>
        <header className='flex flex-col gap-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 md:flex-row md:items-start md:justify-between'>
          <div>
            <h1 className='text-[2rem] font-semibold tracking-tight text-[var(--text-primary)]'>
              Profile
            </h1>
            <p className='mt-1 text-sm text-[var(--text-secondary)]'>
              Your account details and danger zone.
            </p>
          </div>

          <div className='flex flex-wrap gap-2 md:justify-end'>
            <button
              className='rounded-lg border border-[var(--border-default)] bg-transparent px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
              onClick={() => router.push('/settings')}>
              Back
            </button>
          </div>
        </header>

        {/* Account overview + display name editor */}
        <section className='space-y-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
          <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
            Account
          </h2>

          <dl className='space-y-3 text-sm'>
            <div className='flex justify-between gap-4'>
              <dt className='text-[var(--text-secondary)]'>Email</dt>
              <dd className='text-[var(--text-primary)]'>{email ?? '—'}</dd>
            </div>
          </dl>

          <form
            onSubmit={handleSaveDisplayName}
            className='space-y-3 border-t border-[var(--border-default)] pt-5'>
            <div className='flex items-center justify-between gap-3'>
              <label
                htmlFor='display-name'
                className='text-sm font-medium text-[var(--text-primary)]'>
                Display name
              </label>
              {statusMessage && (
                <span className='text-xs text-[var(--text-secondary)]'>
                  {statusMessage}
                </span>
              )}
            </div>
            <p className='text-xs text-[var(--text-secondary)]'>
              Shown in the dashboard greeting. Leave blank to default to
              &ldquo;Trader&rdquo;.
            </p>
            <input
              id='display-name'
              type='text'
              autoComplete='off'
              maxLength={80}
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              disabled={loadingProfile || saving}
              placeholder='e.g., Prosper'
              className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60'
            />
            <div>
              <button
                type='submit'
                disabled={loadingProfile || saving}
                className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60'>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </section>

        {/* Trading defaults: risk per trade + target reward-to-risk. */}
        <section className='space-y-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
              Trading defaults
            </h2>
            {tradingStatus && (
              <span className='text-xs text-[var(--text-secondary)]'>
                {tradingStatus}
              </span>
            )}
          </div>
          <p className='text-sm text-[var(--text-secondary)]'>
            Used across your journal and Foresight. The trade form warns when a
            trade risks more than your max, and Foresight treats it as your risk
            limit.
          </p>
          <form
            onSubmit={handleSaveTradingDefaults}
            className='space-y-4 border-t border-[var(--border-default)] pt-5'>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <label
                  htmlFor='risk-per-trade'
                  className='text-sm font-medium text-[var(--text-primary)]'>
                  Max risk per trade (%)
                </label>
                <input
                  id='risk-per-trade'
                  type='number'
                  step='0.1'
                  min='0'
                  value={riskDraft}
                  onChange={(e) => setRiskDraft(e.target.value)}
                  disabled={loadingProfile || savingTrading}
                  placeholder='1'
                  className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60'
                />
                <p className='text-xs text-[var(--text-muted)]'>
                  e.g. 1 means warn when a trade risks more than 1% of the
                  account.
                </p>
              </div>
              <div className='space-y-1.5'>
                <label
                  htmlFor='target-rr'
                  className='text-sm font-medium text-[var(--text-primary)]'>
                  Target reward-to-risk (R)
                </label>
                <input
                  id='target-rr'
                  type='number'
                  step='0.1'
                  min='0'
                  value={rrDraft}
                  onChange={(e) => setRrDraft(e.target.value)}
                  disabled={loadingProfile || savingTrading}
                  placeholder='2'
                  className='w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60'
                />
                <p className='text-xs text-[var(--text-muted)]'>
                  Your planned reward-to-risk, used in analytics.
                </p>
              </div>
            </div>
            <button
              type='submit'
              disabled={loadingProfile || savingTrading}
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60'>
              {savingTrading ? 'Saving...' : 'Save'}
            </button>
          </form>
        </section>

        {/* Telegram alerts for Foresight. */}
        <ConnectTelegram />

        {/* Weekly Hindsight digest opt-out. */}
        <WeeklyDigestToggle />

        {/* Your data — portability, as promised in the privacy policy. */}
        <section className='rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
          <h2 className='text-lg font-semibold'>Your data</h2>
          <p className='mt-1 text-sm text-[var(--text-secondary)]'>
            Export your full trade history as a CSV file you can open in Excel
            or import anywhere. Your data is yours.
          </p>
          <div className='mt-4'>
            <ExportTradesButton />
          </div>
        </section>

        {/* Danger zone — destructive actions. Red-bordered to set tone. */}
        <section className='rounded-xl border border-red-500/40 bg-red-500/[0.04] p-5'>
          <h2 className='text-lg font-semibold text-red-400'>Danger zone</h2>
          <p className='mt-1 text-sm text-[var(--text-secondary)]'>
            Permanently delete your account and all data we hold about you.
            This action cannot be undone.
          </p>

          <div className='mt-5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4'>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div className='space-y-1'>
                <h3 className='text-sm font-semibold text-[var(--text-primary)]'>
                  Delete account
                </h3>
                <p className='text-xs leading-relaxed text-[var(--text-secondary)]'>
                  Removes your account, all trades, all trading accounts, all
                  setup templates, all screenshots, and all other personal
                  data within 30 days. We may retain limited information where
                  required by law (see our{' '}
                  <a
                    href='/privacy'
                    className='underline-offset-4 hover:underline'>
                    Privacy Policy
                  </a>
                  ).
                </p>
              </div>
              <button
                type='button'
                onClick={() => setDeleteOpen(true)}
                className='shrink-0 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20'>
                Delete account
              </button>
            </div>
          </div>
        </section>
      </div>

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      />
    </main>
  );
}
