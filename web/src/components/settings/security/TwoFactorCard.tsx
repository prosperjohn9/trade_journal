'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase/client';
import { apiPost } from '@/src/lib/api/fetcher';

// Opt-in two-factor authentication (TOTP). Users who never enable it are
// unaffected; those who do get prompted for a code at sign-in. Enrollment is the
// standard Supabase flow: enroll -> show QR -> verify a code to activate, then we
// hand them backup recovery codes in case they lose the authenticator.

type Factor = { id: string; friendlyName: string | null };
type Enrolling = { factorId: string; qr: string; secret: string };

export function TwoFactorCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'info' } | null>(
    null,
  );
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  async function genRecoveryCodes() {
    try {
      const r = await apiPost<{ codes: string[] }>(
        '/api/auth/mfa/recovery-codes',
        {},
      );
      setRecoveryCodes(r.codes);
    } catch {
      // Non-fatal: 2FA is still on; they can regenerate later.
      setMsg({
        text: 'Two-factor is on, but recovery codes could not be generated. Use "Regenerate recovery codes" to try again.',
        tone: 'error',
      });
    }
  }

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = (data?.totp ?? []).filter((f) => f.status === 'verified');
    setFactors(
      verified.map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null })),
    );
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const verified = (data?.totp ?? []).filter((f) => f.status === 'verified');
      setFactors(
        verified.map((f) => ({
          id: f.id,
          friendlyName: f.friendly_name ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startEnroll() {
    setMsg(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
      });
      if (error || !data) {
        setMsg({ text: error?.message ?? 'Could not start setup.', tone: 'error' });
        return;
      }
      setEnrolling({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling || busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrolling.factorId,
        code: code.trim(),
      });
      if (error) {
        setMsg({
          text: 'That code did not match. Try the current one from your app.',
          tone: 'error',
        });
        return;
      }
      setEnrolling(null);
      setCode('');
      setMsg({ text: 'Two-factor authentication is on.', tone: 'info' });
      await refresh();
      await genRecoveryCodes();
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (!enrolling) return;
    setBusy(true);
    try {
      // Drop the half-finished (unverified) factor so it doesn't linger.
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    } catch {
      // best-effort
    } finally {
      setEnrolling(null);
      setCode('');
      setBusy(false);
    }
  }

  async function remove(factorId: string) {
    setMsg(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        setMsg({
          text: 'Could not remove it. Sign out and back in, then try again.',
          tone: 'error',
        });
        return;
      }
      setMsg({ text: 'Two-factor authentication removed.', tone: 'info' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const enabled = factors.length > 0;

  return (
    <section className='space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold text-[var(--text-primary)]'>
            Two-factor authentication
          </h2>
          <p className='mt-0.5 text-sm text-[var(--text-secondary)]'>
            Optional. Add a code from an authenticator app (Google Authenticator,
            Authy, 1Password) on top of your password. You will only be asked for
            it at sign-in once enabled.
          </p>
        </div>
        <span
          className='shrink-0 rounded-full px-2.5 py-1 text-xs font-medium'
          style={{
            color: enabled ? 'var(--win)' : 'var(--text-muted)',
            backgroundColor: enabled
              ? 'color-mix(in srgb, var(--win) 16%, transparent)'
              : 'var(--surface-muted)',
          }}>
          {loading ? '…' : enabled ? 'On' : 'Off'}
        </span>
      </div>

      {msg ? (
        <p
          className='rounded-lg px-3 py-2 text-xs'
          style={{
            color: msg.tone === 'error' ? 'var(--loss)' : 'var(--text-secondary)',
            backgroundColor: 'var(--surface-muted)',
          }}>
          {msg.text}
        </p>
      ) : null}

      {recoveryCodes ? (
        <div className='rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4'>
          <p className='text-sm font-semibold text-[var(--text-primary)]'>
            Save your recovery codes
          </p>
          <p className='mt-0.5 text-xs text-[var(--text-secondary)]'>
            Keep these somewhere safe. If you ever lose your authenticator, one
            code lets you turn 2FA off and sign back in. They are shown only once,
            and generating a new set replaces these.
          </p>
          <div className='mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm text-[var(--text-primary)]'>
            {recoveryCodes.map((rc) => (
              <span key={rc} className='rounded bg-[var(--bg-app)] px-2 py-1'>
                {rc}
              </span>
            ))}
          </div>
          <div className='mt-3 flex gap-2'>
            <button
              type='button'
              onClick={() =>
                void navigator.clipboard?.writeText(recoveryCodes.join('\n'))
              }
              className='rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'>
              Copy
            </button>
            <button
              type='button'
              onClick={() => setRecoveryCodes(null)}
              className='rounded-lg bg-[var(--accent-cta)] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110'>
              I&apos;ve saved them
            </button>
          </div>
        </div>
      ) : null}

      {enrolling ? (
        <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4'>
          <p className='text-sm text-[var(--text-secondary)]'>
            Scan this with your authenticator app, then enter the 6-digit code it
            shows.
          </p>
          <div
            className='mt-3 inline-block rounded-lg bg-white p-2'
            // Supabase returns the QR as an SVG string from our own auth backend.
            dangerouslySetInnerHTML={{ __html: enrolling.qr }}
          />
          <p className='mt-2 break-all text-[11px] text-[var(--text-muted)]'>
            Can&apos;t scan? Enter this key manually:{' '}
            <span className='font-mono text-[var(--text-secondary)]'>
              {enrolling.secret}
            </span>
          </p>
          <form onSubmit={confirmEnroll} className='mt-3 flex gap-2'>
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode='numeric'
              autoComplete='one-time-code'
              placeholder='123456'
              className='w-32 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-center tracking-[0.3em] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
            />
            <button
              type='submit'
              disabled={busy || code.length < 6}
              className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
              {busy ? 'Verifying…' : 'Verify & turn on'}
            </button>
            <button
              type='button'
              onClick={() => void cancelEnroll()}
              disabled={busy}
              className='rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]'>
              Cancel
            </button>
          </form>
        </div>
      ) : enabled ? (
        <div className='space-y-2'>
          {factors.map((f) => (
            <div
              key={f.id}
              className='flex items-center justify-between gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
              <span className='text-sm text-[var(--text-primary)]'>
                {f.friendlyName ?? 'Authenticator app'}
              </span>
              <button
                onClick={() => void remove(f.id)}
                disabled={busy}
                className='text-xs font-medium text-[var(--loss)] hover:underline disabled:opacity-60'>
                Remove
              </button>
            </div>
          ))}
          {!recoveryCodes ? (
            <button
              type='button'
              onClick={() => void genRecoveryCodes()}
              disabled={busy}
              className='text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'>
              Regenerate recovery codes
            </button>
          ) : null}
        </div>
      ) : (
        <button
          onClick={() => void startEnroll()}
          disabled={busy || loading}
          className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
          {busy ? 'Starting…' : 'Enable two-factor'}
        </button>
      )}
    </section>
  );
}
