'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { AiMarkdown } from '@/src/components/ui/AiMarkdown';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const APP_PREFIXES = [
  '/dashboard',
  '/trades',
  '/analytics',
  '/reports',
  '/settings',
];
const THEME_STORAGE_KEY = 'dashboard-theme';
const MAX_STORED = 50; // cap persisted history
const GREETING =
  "Hi! I'm your Trader's Hindsight assistant. Ask me how to use the app, about your performance, or anything on journaling and trading discipline.";

const historyKey = (uid: string) => `th-chat-history-${uid}`;

function ChatIcon() {
  return (
    <svg
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'>
      <path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' />
    </svg>
  );
}

export function ChatWidget() {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      const uid = session?.user?.id ?? null;
      // Load any saved history for this user before marking ready, so a reload
      // restores the conversation in one render (no flash, no clobber).
      if (uid) {
        try {
          const saved = window.localStorage.getItem(historyKey(uid));
          const parsed = saved ? JSON.parse(saved) : null;
          if (Array.isArray(parsed)) setMessages(parsed as ChatMessage[]);
        } catch {
          // ignore corrupt history
        }
      }
      setUserId(uid);
      setAuthed(Boolean(session));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthed(Boolean(session));
      setUserId(session?.user?.id ?? null);
      if (event === 'SIGNED_OUT') {
        setMessages([]);
        setOpen(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Persist history per user (cleared on sign-out by the handler above).
  useEffect(() => {
    if (!userId) return;
    try {
      window.localStorage.setItem(
        historyKey(userId),
        JSON.stringify(messages.slice(-MAX_STORED)),
      );
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [messages, userId]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved);
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  function clearChat() {
    setMessages([]);
    setError(null);
    if (userId) {
      try {
        window.localStorage.removeItem(historyKey(userId));
      } catch {
        // ignore
      }
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages([...next, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant' && !last.content) copy.pop();
        return copy;
      });
      setError(e instanceof Error ? e.message : 'Chat failed. Try again.');
    } finally {
      setStreaming(false);
    }
  }

  const onAppPage = APP_PREFIXES.some((p) => pathname?.startsWith(p));
  if (!authed || !onAppPage) return null;

  return (
    <div
      className='dashboard-theme fixed bottom-4 right-4 z-50 flex flex-col items-end'
      data-theme={theme}>
      {open ? (
        <div className='mb-3 flex h-[32rem] max-h-[75vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl'>
          <div className='flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3'>
            <div>
              <div className='text-sm font-semibold text-[var(--text-primary)]'>
                Assistant
              </div>
              <div className='text-xs text-[var(--text-muted)]'>
                Help &amp; coaching
              </div>
            </div>
            <div className='flex items-center gap-1'>
              {messages.length > 0 ? (
                <button
                  type='button'
                  onClick={clearChat}
                  className='rounded-md px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
                  Clear
                </button>
              ) : null}
              <button
                type='button'
                onClick={() => setOpen(false)}
                aria-label='Close assistant'
                className='rounded-md px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'>
                ✕
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className='flex-1 space-y-3 overflow-y-auto px-4 py-3'>
            {messages.length === 0 ? (
              <p className='text-sm text-[var(--text-secondary)]'>{GREETING}</p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                  }>
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent-cta)] px-3 py-2 text-sm text-white'
                        : 'max-w-[92%] rounded-2xl rounded-bl-sm bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]'
                    }>
                    {m.role === 'assistant' ? (
                      m.content ? (
                        <AiMarkdown text={m.content} />
                      ) : (
                        <span className='text-[var(--text-muted)]'>
                          Thinking...
                        </span>
                      )
                    ) : (
                      <span className='whitespace-pre-wrap'>{m.content}</span>
                    )}
                  </div>
                </div>
              ))
            )}
            {error ? (
              <p className='text-xs text-[var(--loss)]'>{error}</p>
            ) : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className='border-t border-[var(--border-default)] p-3'>
            <div className='flex items-end gap-2'>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder='Ask anything...'
                disabled={streaming}
                className='max-h-28 flex-1 resize-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-60'
              />
              <button
                type='submit'
                disabled={streaming || !input.trim()}
                className='shrink-0 rounded-lg bg-[var(--accent-cta)] px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'>
                Send
              </button>
            </div>
            <p className='mt-2 text-[10px] text-[var(--text-muted)]'>
              Educational only, not financial advice.
            </p>
          </form>
        </div>
      ) : null}

      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        className='flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-cta)] text-white shadow-lg transition-transform hover:scale-105'>
        {open ? <span className='text-2xl leading-none'>✕</span> : <ChatIcon />}
      </button>
    </div>
  );
}
