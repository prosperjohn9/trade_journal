import { type ReactNode } from 'react';

/**
 * Lightweight renderer for the AI features' predictable Markdown: bold
 * `**Heading**` lines become subheadings, `- ` lines become bullets, and stray
 * `**` is stripped. Avoids pulling in a Markdown dependency for a handful of
 * fixed sections. Shared by the trade review and the insights card.
 */
export function AiMarkdown({ text }: { text: string }) {
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
