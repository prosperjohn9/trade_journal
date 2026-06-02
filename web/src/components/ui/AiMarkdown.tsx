import { type ReactNode } from 'react';

/**
 * Lightweight renderer for the AI features' predictable Markdown: bold
 * `**Heading**` lines become subheadings, `- ` lines become bullets, and stray
 * `**` is stripped. Avoids pulling in a Markdown dependency for a handful of
 * fixed sections. Shared by the trade review and the insights card.
 */

const INLINE_RE = /\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*/g;

/** Allow only safe, non-script hrefs (internal paths, mailto, http(s)). */
function safeHref(url: string): string | null {
  const u = url.trim();
  if (
    u.startsWith('/') ||
    u.startsWith('mailto:') ||
    u.startsWith('https://') ||
    u.startsWith('http://')
  ) {
    return u;
  }
  return null;
}

/** Render inline Markdown links `[text](url)` and bold `**text**` within a line. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index).replace(/\*\*/g, ''));
    if (m[1] !== undefined && m[2] !== undefined) {
      const href = safeHref(m[2]);
      if (href) {
        const external = href.startsWith('http');
        nodes.push(
          <a
            key={`${keyBase}-a-${idx}`}
            href={href}
            className='font-medium text-[var(--accent)] underline underline-offset-2 hover:opacity-80'
            {...(external
              ? { target: '_blank', rel: 'noreferrer noopener' }
              : {})}>
            {m[1]}
          </a>,
        );
      } else {
        nodes.push(m[1]);
      }
    } else if (m[3] !== undefined) {
      nodes.push(
        <strong
          key={`${keyBase}-b-${idx}`}
          className='font-semibold text-[var(--text-primary)]'>
          {m[3]}
        </strong>,
      );
    }
    last = m.index + m[0].length;
    idx++;
  }
  if (last < text.length) nodes.push(text.slice(last).replace(/\*\*/g, ''));
  return nodes;
}

export function AiMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: ReactNode[] = [];

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
      bullets.push(renderInline(line.replace(/^[-*•]\s+/, ''), `b-${i}`));
      return;
    }
    flush(String(i));
    blocks.push(
      <p key={i} className='text-sm text-[var(--text-secondary)]'>
        {renderInline(line, `p-${i}`)}
      </p>,
    );
  });
  flush('end');

  return <div className='space-y-3'>{blocks}</div>;
}
