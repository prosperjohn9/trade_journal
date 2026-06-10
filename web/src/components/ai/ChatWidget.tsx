'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/src/lib/supabase/client';
import { ApiError, isUpgradeError } from '@/src/lib/api/fetcher';
import { AiMarkdown } from '@/src/components/ui/AiMarkdown';
import { UpgradePrompt } from '@/src/components/ui/UpgradePrompt';
import { isSupportOnline, loadTawk, openTawk } from '@/src/lib/ai/tawk';

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
const HISTORY_TTL_MS = 14 * 24 * 60 * 60 * 1000; // forget stored history after 14 days

function loadHistory(uid: string): ChatMessage[] | null {
  try {
    const raw = window.localStorage.getItem(historyKey(uid));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    // Legacy bare-array format from earlier builds.
    if (Array.isArray(parsed)) return parsed as ChatMessage[];
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { messages?: unknown }).messages)
    ) {
      const rec = parsed as { savedAt?: number; messages: ChatMessage[] };
      if (
        typeof rec.savedAt === 'number' &&
        Date.now() - rec.savedAt > HISTORY_TTL_MS
      ) {
        window.localStorage.removeItem(historyKey(uid));
        return null;
      }
      return rec.messages;
    }
    return null;
  } catch {
    return null;
  }
}

function saveHistory(uid: string, messages: ChatMessage[]) {
  try {
    window.localStorage.setItem(
      historyKey(uid),
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        messages: messages.slice(-MAX_STORED),
      }),
    );
  } catch {
    // storage full / unavailable — non-fatal
  }
}

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
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null);
  const [confirmHuman, setConfirmHuman] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Load saved history for a user, then mark hydrated. The persist effect is
    // gated on this flag so an early auth event can't write an empty array over
    // saved history before it loads (that was wiping the chat on reload).
    const hydrate = (uid: string | null) => {
      if (uid) {
        const loaded = loadHistory(uid);
        if (loaded && loaded.length) setMessages(loaded);
      }
      hydratedRef.current = true;
    };

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      setAuthed(Boolean(session));
      hydrate(uid);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? null;
      setAuthed(Boolean(session));
      setUserId(uid);
      if (event === 'SIGNED_OUT') {
        hydratedRef.current = false;
        setMessages([]);
        setConfirmHuman(false);
        setOpen(false);
      } else if (event === 'SIGNED_IN') {
        hydrate(uid);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Persist history per user, but only once hydration has loaded any saved
  // messages (cleared on sign-out by the handler above).
  useEffect(() => {
    if (!userId || !hydratedRef.current) return;
    saveHistory(userId, messages);
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
    setUpgradeMsg(null);

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
        throw new ApiError(
          errBody.error || `Request failed (${res.status})`,
          res.status,
          typeof errBody.code === 'string' ? errBody.code : null,
        );
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
      if (isUpgradeError(e)) setUpgradeMsg(e.message);
      else setError(e instanceof Error ? e.message : 'Chat failed. Try again.');
    } finally {
      setStreaming(false);
    }
  }

  function botSay(content: string) {
    setMessages((m) => [...m, { role: 'assistant', content }]);
  }

  // Clicking "Talk to a human" nudges first-timers to try the assistant first;
  // anyone who has already chatted with it is escalated straight away.
  function handleTalkToHuman() {
    const hasChatted = messages.some((m) => m.role === 'user');
    if (!hasChatted) {
      setConfirmHuman(true);
      return;
    }
    void connectToHuman();
  }

  async function connectToHuman() {
    setConfirmHuman(false);

    // In support hours: open the live chat, pre-identified, and go straight in.
    if (isSupportOnline()) {
      botSay('Connecting you to our team — the live chat window should open now.');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email ?? undefined;
      await loadTawk(email ? { name: email, email } : undefined);
      openTawk();
      return;
    }

    // Outside hours: forward the conversation to the Contact inbox so the team
    // can reply by email. The user is signed in, so we use their account email.
    const userQuestions = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content);
    if (!userQuestions.length) {
      botSay(
        "Our live team is online 8am to 10pm Istanbul time and is offline right now. Tell me your question first, then tap 'Talk to a human' and I'll forward it so the team can email you back.",
      );
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) throw new Error('no email');
      const transcript = userQuestions.slice(-6).join('\n\n').slice(0, 3500);
      const { error: insErr } = await supabase.from('contact_messages').insert({
        email,
        request_type: 'general',
        message: `[Forwarded from the in-app assistant]\n\n${transcript}`,
      });
      if (insErr) throw insErr;
      botSay(
        `Our live team is offline right now (online 8am to 10pm Istanbul time). I've forwarded your message — they'll email you at ${email}.`,
      );
    } catch {
      botSay(
        "Our live team is offline right now (8am to 10pm Istanbul time). I couldn't forward your message automatically — please use the [Contact page](/contact) and we'll email you back.",
      );
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

          <button
            type='button'
            onClick={handleTalkToHuman}
            className='flex w-full items-center justify-between border-b border-[var(--border-default)] px-4 py-2 text-left text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-subtle)]'>
            <span>Talk to a human</span>
            <span aria-hidden>→</span>
          </button>

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
            {upgradeMsg ? <UpgradePrompt message={upgradeMsg} compact /> : null}
            {error ? (
              <p className='text-xs text-[var(--loss)]'>{error}</p>
            ) : null}
          </div>

          {confirmHuman ? (
            <div className='border-t border-[var(--border-default)] bg-[var(--bg-subtle)] px-4 py-3'>
              <p className='text-sm text-[var(--text-secondary)]'>
                Our AI assistant can answer most questions instantly — how-tos,
                your stats, and troubleshooting. Want to try it first?
              </p>
              <div className='mt-3 flex gap-2'>
                <button
                  type='button'
                  onClick={() => setConfirmHuman(false)}
                  className='rounded-lg bg-[var(--accent-cta)] px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110'>
                  Try the assistant
                </button>
                <button
                  type='button'
                  onClick={() => void connectToHuman()}
                  className='rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface)]'>
                  Talk to a human
                </button>
              </div>
            </div>
          ) : null}

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
