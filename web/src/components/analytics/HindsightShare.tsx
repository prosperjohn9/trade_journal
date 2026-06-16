'use client';

import { useMemo, useState } from 'react';

// The viral wedge: turn a Hindsight finding into a clean, branded image the
// trader can post to Discord / X / Reddit. Generated entirely client-side from
// a self-contained SVG (no external fonts or images, so it renders to canvas
// without tainting), so nothing financial is ever exposed on a public URL.

export type ShareData = {
  currency: string;
  period: '30d' | 'all';
  leakLabel: string;
  leakCost: number; // > 0, the cost of the leak
  counterfactualPnl: number;
  actualPnl: number;
};

const SIZE = 1080;

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    }).format(n);
  } catch {
    return `${n > 0 ? '+' : ''}${Math.round(n)} ${currency}`;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvg(d: ShareData, showPnl: boolean): string {
  const periodText =
    d.period === '30d' ? 'in the last 30 days' : 'across my whole journal';
  const cost = money(-Math.abs(d.leakCost), d.currency); // shown as a loss
  const font = 'Arial, Helvetica, sans-serif';

  const pnlRow = showPnl
    ? `
    <text x="540" y="700" text-anchor="middle" font-family="${font}" font-size="30" fill="#aab2c5">My P&amp;L: <tspan fill="${
      d.actualPnl >= 0 ? '#34d399' : '#f87171'
    }" font-weight="700">${esc(money(d.actualPnl, d.currency))}</tspan>  →  Without this habit: <tspan fill="#34d399" font-weight="700">${esc(
      money(d.counterfactualPnl, d.currency),
    )}</tspan></text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="#0B1020"/>
  <rect x="40" y="40" width="${SIZE - 80}" height="${SIZE - 80}" rx="32" fill="#0E1428" stroke="#1f2740" stroke-width="2"/>
  <circle cx="476" cy="132" r="8" fill="#818cf8"/>
  <text x="500" y="140" font-family="${font}" font-size="26" letter-spacing="6" font-weight="700" fill="#8b93a7">THE TRADER'S HINDSIGHT</text>
  <text x="540" y="320" text-anchor="middle" font-family="${font}" font-size="46" font-weight="600" fill="#e6e9f0">${esc(
    d.leakLabel,
  )}</text>
  <text x="540" y="470" text-anchor="middle" font-family="${font}" font-size="128" font-weight="800" fill="#f87171">${esc(
    cost,
  )}</text>
  <text x="540" y="560" text-anchor="middle" font-family="${font}" font-size="32" fill="#aab2c5">is what this one habit cost me ${periodText}.</text>
  <line x1="160" y1="630" x2="920" y2="630" stroke="#1f2740" stroke-width="2"/>
  ${pnlRow}
  <text x="540" y="960" text-anchor="middle" font-family="${font}" font-size="38" font-weight="700" fill="#818cf8">tradershindsight.com</text>
  <text x="540" y="1010" text-anchor="middle" font-family="${font}" font-size="26" fill="#6b7280">See what your trading habits cost you, in money.</text>
</svg>`;
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render image.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Export failed.'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ShareButton({ data }: { data: ShareData }) {
  const [open, setOpen] = useState(false);
  const [showPnl, setShowPnl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const svg = useMemo(() => buildSvg(data, showPnl), [data, showPnl]);

  async function download() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await svgToPngBlob(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-hindsight.png';
      a.click();
      URL.revokeObjectURL(url);
      setNote('Saved. Post it and tag the leak you are fixing.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not save the image.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await svgToPngBlob(svg);
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setNote('Copied. Paste it straight into Discord, X, or a DM.');
    } catch {
      setNote('Copy is not supported here, use Download instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type='button'
        onClick={() => {
          setNote(null);
          setOpen(true);
        }}
        className='rounded-lg border border-[var(--border-default)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
        Share
      </button>

      {open ? (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'
          onClick={() => !busy && setOpen(false)}>
          <div
            className='w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 text-[var(--text-primary)] shadow-xl'
            onClick={(e) => e.stopPropagation()}>
            <div className='flex items-center justify-between'>
              <h3 className='text-base font-semibold'>Share your Hindsight</h3>
              <button
                className='text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                onClick={() => !busy && setOpen(false)}
                aria-label='Close'>
                ✕
              </button>
            </div>

            <div
              className='mt-3 overflow-hidden rounded-lg border border-[var(--border-default)]'
              dangerouslySetInnerHTML={{
                __html: svg.replace(
                  '<svg ',
                  '<svg style="width:100%;height:auto;display:block" ',
                ),
              }}
            />

            <label className='mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]'>
              <input
                type='checkbox'
                checked={showPnl}
                onChange={(e) => setShowPnl(e.target.checked)}
              />
              Include my P&amp;L numbers
            </label>

            <div className='mt-3 flex gap-2'>
              <button
                onClick={() => void download()}
                disabled={busy}
                className='flex-1 rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60'>
                {busy ? 'Working...' : 'Download PNG'}
              </button>
              <button
                onClick={() => void copy()}
                disabled={busy}
                className='rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-60'>
                Copy
              </button>
            </div>

            {note ? (
              <p className='mt-2 text-xs text-[var(--text-muted)]'>{note}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
