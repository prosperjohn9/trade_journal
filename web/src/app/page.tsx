import Link from 'next/link';
import { MarketingShell } from '@/src/components/marketing/MarketingShell';
import { AuthCodeHandler } from '@/src/components/auth/AuthCodeHandler';

// Public marketing landing page for The Trader's Hindsight.
//
// Positioned around the wedge: the journal that shows, in money, what your
// trading habits cost you, then helps you stop and proves what you saved.
// Server component (no client interactivity), always dark like a trader's tool.

export default function LandingPage() {
  return (
    <MarketingShell>
      <AuthCodeHandler />
      <Hero />
      <StatsStrip />
      <HowItWorks />
      <Features />
      <PhilosophyStrip />
      <FinalCta />
    </MarketingShell>
  );
}

function Hero() {
  return (
    <section className='relative overflow-hidden border-b border-white/5'>
      <div
        aria-hidden
        className='absolute left-1/2 top-0 -z-0 h-[640px] w-[1120px] -translate-x-1/2 opacity-[0.22]'
        style={{
          background:
            'radial-gradient(closest-side, #6366f1 0%, rgba(99,102,241,0) 70%)',
        }}
      />
      <div className='relative mx-auto max-w-5xl px-6 py-20 text-center sm:py-28'>
        <p className='mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-300'>
          <span className='inline-block h-1.5 w-1.5 rounded-full bg-indigo-400' />
          For forex &amp; prop-firm traders
        </p>
        <h1 className='mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl'>
          See what your habits cost you.{' '}
          <span className='bg-gradient-to-r from-indigo-300 via-indigo-200 to-white bg-clip-text text-transparent'>
            In money.
          </span>
        </h1>
        <p className='mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg'>
          The Trader&apos;s Hindsight reads your synced trades, finds the one
          habit quietly draining your account, and shows you in dollars what it
          cost. Then it helps you stop, and proves what you saved.
        </p>
        <div className='mt-9 flex flex-wrap items-center justify-center gap-3'>
          <Link
            href='/auth'
            className='rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-400'>
            Start free
          </Link>
          <a
            href='#how-it-works'
            className='rounded-lg border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]'>
            See how it works
          </a>
        </div>
        <p className='mt-5 text-xs text-slate-400'>
          Free statement import. cTrader auto-sync free. Cancel anytime.
        </p>

        <ReceiptCard />
      </div>
    </section>
  );
}

// A sample of the shareable Hindsight card, the product's core "aha".
function ReceiptCard() {
  return (
    <div className='mx-auto mt-14 max-w-md rounded-2xl border border-white/10 bg-[#0E1428] p-8 text-left shadow-2xl'>
      <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'>
        <span className='inline-block h-1.5 w-1.5 rounded-full bg-indigo-400' />
        The Trader&apos;s Hindsight
      </div>
      <div className='mt-6 text-center'>
        <div className='text-lg font-medium text-slate-200'>
          Trading on Thursdays
        </div>
        <div className='mt-2 text-6xl font-extrabold text-rose-400'>
          -$1,687
        </div>
        <div className='mt-2 text-sm text-slate-400'>
          is what this one habit cost me in the last 30 days.
        </div>
      </div>
      <div className='mt-6 border-t border-white/10 pt-4 text-center text-sm text-slate-400'>
        My P&amp;L: <span className='font-semibold text-rose-400'>-$1,437</span>
        {'  →  '}Without this habit:{' '}
        <span className='font-semibold text-emerald-400'>+$250</span>
      </div>
      <p className='mt-4 text-center text-[11px] text-slate-500'>
        Illustrative. Your report is built from your own trades.
      </p>
    </div>
  );
}

function StatsStrip() {
  const stats = [
    { big: '$4,270', small: 'average spend on challenge fees before payout' },
    { big: '~1 in 14', small: 'traders pass a prop evaluation' },
    { big: '71%', small: 'of first-phase failures are a daily-drawdown breach' },
  ];
  return (
    <section className='border-b border-white/5 bg-[#0d1426]'>
      <div className='mx-auto max-w-5xl px-6 py-16'>
        <div className='grid gap-6 sm:grid-cols-3'>
          {stats.map((s) => (
            <div key={s.big} className='text-center'>
              <div className='text-3xl font-bold text-white sm:text-4xl'>
                {s.big}
              </div>
              <div className='mx-auto mt-2 max-w-[14rem] text-sm text-slate-400'>
                {s.small}
              </div>
            </div>
          ))}
        </div>
        <p className='mx-auto mt-10 max-w-2xl text-center text-sm text-slate-300 sm:text-base'>
          Most blown accounts are not a strategy problem. They are a habit you
          cannot see, revenge trading, sizing up after a loss, a session that
          bleeds you. We make that habit visible, and put a price on it.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: '01',
      title: 'Connect or import',
      body: 'Auto-sync cTrader free, sync one MetaTrader account, or import an MT5 report or CSV from any platform. No manual entry.',
    },
    {
      n: '02',
      title: 'Diagnose',
      body: 'Your Hindsight Report finds your costliest habit and prices it: "this one cost you $1,687 over 30 days."',
    },
    {
      n: '03',
      title: 'Commit',
      body: 'Turn any finding into a rule with one tap. We track it automatically from every new trade you make.',
    },
    {
      n: '04',
      title: 'Prove',
      body: 'See the dollars you kept by sticking to it. Receipts no other journal can show you.',
    },
  ];

  return (
    <section id='how-it-works' className='border-b border-white/5'>
      <div className='mx-auto max-w-5xl px-6 py-20 sm:py-24'>
        <div className='text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300'>
            How it works
          </p>
          <h2 className='mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-3xl font-semibold tracking-tight sm:text-4xl'>
            <span>Connect</span>
            <FlowArrow />
            <span>Diagnose</span>
            <FlowArrow />
            <span>Commit</span>
            <FlowArrow />
            <span>Prove</span>
          </h2>
          <p className='mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base'>
            Get your trades in, see what your habits cost you, commit to fixing
            the biggest one, and watch the money you keep add up.
          </p>
        </div>

        <ol className='mt-12 grid gap-4 md:grid-cols-4'>
          {steps.map((step) => (
            <li
              key={step.n}
              className='rounded-2xl border border-white/10 bg-white/[0.03] p-5'>
              <div className='font-mono text-xs font-semibold tracking-wider text-indigo-300'>
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

function FlowArrow() {
  return (
    <span
      aria-hidden
      className='hidden text-indigo-300/80 sm:inline-flex sm:items-center'>
      <svg
        width='22'
        height='14'
        viewBox='0 0 20 14'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'>
        <path
          d='M1 7H18M18 7L12 1M18 7L12 13'
          stroke='currentColor'
          strokeWidth='1.6'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    </span>
  );
}

function Features() {
  const features: Array<{ icon: string; title: string; body: string }> = [
    {
      icon: '💸',
      title: 'Cost in dollars, not vibes',
      body: 'Not just "you revenge-trade." We recalculate your month without the habit and show you exactly what it cost.',
    },
    {
      icon: '✅',
      title: 'The commitment loop',
      body: 'Commit to one rule, we auto-track whether you keep it from your trades, and prove the money you saved.',
    },
    {
      icon: '🔌',
      title: 'Auto-sync and free import',
      body: 'cTrader sync free, one MetaTrader account included, plus free import from MT5, cTrader, TradeLocker, DXtrade, and MatchTrader.',
    },
    {
      icon: '🏆',
      title: 'Built for prop firms',
      body: 'Challenge drawdown tracking, automatic protection when you breach, and a Prop Career ledger of fees paid versus payouts.',
    },
    {
      icon: '🤖',
      title: 'An AI coach for your journal',
      body: 'A read of your whole history: where your edge is, the habits bleeding you, and the single pattern to break next.',
    },
    {
      icon: '🔒',
      title: 'Your data, private',
      body: 'Encrypted at rest, export anything anytime. We never sell or analyze your trades.',
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
            More than a record. A reason you get better.
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
          &ldquo;Most journals are a mirror. They show you the past and change
          nothing. We built the one that names the habit costing you money,
          helps you stop, and shows you what you saved.&rdquo;
        </p>
        <p className='mt-4 text-sm text-slate-400'>
          Built by a prop trader who lost the fees first.
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
            Find the leak before it blows{' '}
            <span className='bg-gradient-to-r from-indigo-300 to-white bg-clip-text text-transparent'>
              another challenge.
            </span>
          </h2>
          <p className='mx-auto mt-4 max-w-xl text-sm text-slate-300 sm:text-base'>
            One blown challenge costs around $530. Finding the habit behind it
            costs $12 a month. Start free, import your trades, and see your
            first Hindsight Report today.
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Link
              href='/auth'
              className='rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-400'>
              Start free
            </Link>
            <Link
              href='/pricing'
              className='rounded-lg border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]'>
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
