'use client';

// Shown to a brand-new user (no accounts yet). Lays out the whole path so the
// "aha" is obvious: get your trades in, then see what your habits cost you.

type Step = {
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    title: 'Create a trading account',
    body: 'Name it, set the starting balance and currency. Prop challenge or live, either works.',
  },
  {
    title: 'Bring your trades in, free',
    body: 'Auto-sync cTrader, or import an MT5 report or CSV from any platform. MetaTrader auto-sync is one included account.',
  },
  {
    title: 'See your Hindsight Report',
    body: 'Once you have a handful of trades, we show you in money what your habits cost you, then help you fix the biggest one.',
  },
];

export function OnboardingChecklist({
  onCreateAccount,
}: {
  onCreateAccount: () => void;
}) {
  return (
    <section className='rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6'>
      <div className='text-center'>
        <div className='text-3xl'>👋</div>
        <h2 className='mt-2 text-xl font-semibold text-[var(--text-primary)]'>
          Welcome to The Trader&apos;s Hindsight
        </h2>
        <p className='mx-auto mt-1 max-w-md text-sm text-[var(--text-secondary)]'>
          The journal that shows what your trading habits cost you, in money.
          Three steps and you will see your first report.
        </p>
      </div>

      <ol className='mx-auto mt-6 max-w-md space-y-3'>
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className='flex gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-3'>
            <div
              className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold'
              style={{
                backgroundColor:
                  i === 0
                    ? 'var(--accent-cta)'
                    : 'color-mix(in srgb, var(--text-muted) 18%, transparent)',
                color: i === 0 ? '#fff' : 'var(--text-muted)',
              }}>
              {i + 1}
            </div>
            <div>
              <div className='text-sm font-medium text-[var(--text-primary)]'>
                {s.title}
              </div>
              <div className='text-xs text-[var(--text-muted)]'>{s.body}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className='mt-6 text-center'>
        <button
          onClick={onCreateAccount}
          className='rounded-lg bg-[var(--accent-cta)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110'>
          Create your first account
        </button>
        <p className='mt-2 text-xs text-[var(--text-muted)]'>
          Takes about two minutes. cTrader sync and file import are always free.
        </p>
      </div>
    </section>
  );
}
