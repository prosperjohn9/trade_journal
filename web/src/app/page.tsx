import Link from 'next/link';

// Public marketing landing page for The Trader's Hindsight.
//
// Server component (no client interactivity needed). Keeps the page fast,
// SEO-friendly, and independent of the dashboard's theme system — this page
// is always dark, like a proper trader's tool.

export default function LandingPage() {
  return (
    <main className='min-h-screen bg-[#0b1220] text-slate-100 antialiased'>
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <PhilosophyStrip />
      <FinalCta />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className='sticky top-0 z-30 border-b border-white/5 bg-[#0b1220]/85 backdrop-blur'>
      <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-4'>
        <Link href='/' className='flex items-center gap-2 font-semibold'>
          <span className='inline-block h-2 w-2 rounded-full bg-indigo-400' />
          <span>The Trader&apos;s Hindsight</span>
        </Link>
        <div className='flex items-center gap-2'>
          <Link
            href='/auth'
            className='hidden rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white sm:inline-flex'>
            Sign in
          </Link>
          <Link
            href='/auth'
            className='rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-400'>
            Get started — free
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className='relative overflow-hidden border-b border-white/5'>
      {/* Soft accent glow behind the hero */}
      <div
        aria-hidden
        className='absolute left-1/2 top-0 -z-0 h-[640px] w-[1120px] -translate-x-1/2 opacity-[0.22]'
        style={{
          background:
            'radial-gradient(closest-side, #6366f1 0%, rgba(99,102,241,0) 70%)',
        }}
      />
      <div className='relative mx-auto max-w-5xl px-6 py-24 text-center sm:py-32'>
        <p className='mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-300'>
          <span className='inline-block h-1.5 w-1.5 rounded-full bg-indigo-400' />
          Trading journal · Built for review, not bookkeeping
        </p>
        <h1 className='mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl'>
          Make your experience{' '}
          <span className='bg-gradient-to-r from-indigo-300 via-indigo-200 to-white bg-clip-text text-transparent'>
            your edge.
          </span>
        </h1>
        <p className='mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg'>
          The Trader&apos;s Hindsight is the trading journal where every trade
          becomes a lesson, and every lesson becomes part of how you trade
          next. Built for traders who refuse to repeat the same mistakes.
        </p>
        <div className='mt-9 flex flex-wrap items-center justify-center gap-3'>
          <Link
            href='/auth'
            className='rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-400'>
            Start journaling — free
          </Link>
          <a
            href='#how-it-works'
            className='rounded-lg border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]'>
            See how it works
          </a>
        </div>
        <p className='mt-5 text-xs text-slate-400'>
          No credit card. No spreadsheet imports. Just log your first trade.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id='how-it-works'
      className='border-b border-white/5 bg-[#0d1426]'>
      <div className='mx-auto max-w-5xl px-6 py-20 sm:py-24'>
        <div className='text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300'>
            How it works
          </p>
          <h2 className='mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>
            Trade. Review. Repeat. Improve.
          </h2>
          <p className='mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base'>
            Log every trade. Review what worked and what didn&apos;t. Repeat
            the process. Watch your edge compound.
          </p>
        </div>

        <ol className='mt-12 grid gap-4 md:grid-cols-4'>
          {[
            {
              n: '01',
              title: 'Trade',
              body:
                'Log entry, exit, risk, P&L, screenshots, and the setup you took — all in under a minute.',
            },
            {
              n: '02',
              title: 'Review',
              body:
                'Grade your execution against your own checklist. Capture what worked, what didn’t, and why.',
            },
            {
              n: '03',
              title: 'Repeat',
              body:
                'Analytics show you which setups, sessions, and instruments pay — and which bleed you dry.',
            },
            {
              n: '04',
              title: 'Improve',
              body:
                'Stop relearning lessons. Compound the patterns that actually print money.',
            },
          ].map((step) => (
            <li
              key={step.n}
              className='rounded-2xl border border-white/10 bg-white/[0.03] p-5'>
              <div className='font-mono text-xs font-semibold text-indigo-300'>
                {step.n}
              </div>
              <div className='mt-2 text-lg font-semibold text-white'>
                {step.title}
              </div>
              <p className='mt-2 text-sm leading-relaxed text-slate-300'>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  const features: Array<{ icon: string; title: string; body: string }> = [
    {
      icon: '📝',
      title: 'Record what matters',
      body:
        'Every entry, exit, setup, screenshot, and emotion. The details your future self will thank you for.',
    },
    {
      icon: '🔍',
      title: 'Review what works',
      body:
        'Cut through the noise. See which setups pay, which sessions bleed, which mistakes you keep making.',
    },
    {
      icon: '📈',
      title: 'Compound your edge',
      body:
        'Stop relearning the same lesson. Start stacking wins from what you already know.',
    },
    {
      icon: '🧰',
      title: 'Copy-trade across accounts',
      body:
        'One setup taken on three accounts? Log it once. Each account keeps its own outcome, risk, and P&L.',
    },
    {
      icon: '🗓',
      title: 'Monthly performance reports',
      body:
        'Net P&L, win rate, profit factor, drawdown, best and worst days — all in a single review-ready page.',
    },
    {
      icon: '🔒',
      title: 'Your data, on the record',
      body:
        'Private by default. Encrypted at rest. Export anything anytime. We don’t sell or analyze your trades.',
    },
  ];

  return (
    <section className='border-b border-white/5'>
      <div className='mx-auto max-w-6xl px-6 py-20 sm:py-24'>
        <div className='text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300'>
            What you get
          </p>
          <h2 className='mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>
            A journal that pulls its weight.
          </h2>
        </div>

        <div className='mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {features.map((f) => (
            <div
              key={f.title}
              className='rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:bg-white/[0.05]'>
              <div className='mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-xl'>
                {f.icon}
              </div>
              <div className='text-base font-semibold text-white'>
                {f.title}
              </div>
              <p className='mt-2 text-sm leading-relaxed text-slate-300'>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhilosophyStrip() {
  return (
    <section className='border-b border-white/5 bg-[#0d1426]'>
      <div className='mx-auto max-w-3xl px-6 py-20 text-center sm:py-24'>
        <p className='text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300'>
          Why we built this
        </p>
        <p className='mt-5 text-2xl font-medium leading-snug text-white sm:text-3xl'>
          “Most trading journals are spreadsheets with a nicer skin. We built a
          tool that makes you better — by making your past trades work for you,
          not just sit there.”
        </p>
        <p className='mt-4 text-sm text-slate-400'>
          Built by traders, for traders.
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className='border-b border-white/5'>
      <div className='relative mx-auto max-w-4xl px-6 py-20 text-center sm:py-24'>
        <div
          aria-hidden
          className='absolute inset-0 -z-0 opacity-25'
          style={{
            background:
              'radial-gradient(closest-side, #6366f1 0%, rgba(99,102,241,0) 70%)',
          }}
        />
        <div className='relative'>
          <h2 className='text-3xl font-semibold tracking-tight sm:text-5xl'>
            Ready to make your experience{' '}
            <span className='bg-gradient-to-r from-indigo-300 to-white bg-clip-text text-transparent'>
              your edge?
            </span>
          </h2>
          <p className='mx-auto mt-4 max-w-xl text-sm text-slate-300 sm:text-base'>
            Sign up free. Log your first trade in under a minute. Your hindsight
            starts compounding the same day.
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Link
              href='/auth'
              className='rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-400'>
              Get started — free
            </Link>
            <a
              href='#how-it-works'
              className='rounded-lg border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]'>
              How it works
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className='bg-[#0a111e]'>
      <div className='mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-slate-400 sm:flex-row sm:items-center'>
        <div>
          <div className='font-semibold text-white'>The Trader&apos;s Hindsight</div>
          <div className='mt-1 text-xs text-slate-500'>
            Make your experience your edge.
          </div>
        </div>
        <div className='flex items-center gap-5 text-xs text-slate-400'>
          <Link href='/auth' className='hover:text-white'>
            Sign in
          </Link>
          <Link href='/auth' className='hover:text-white'>
            Get started
          </Link>
          <span className='text-slate-600'>
            © {new Date().getFullYear()} The Trader&apos;s Hindsight
          </span>
        </div>
      </div>
    </footer>
  );
}
