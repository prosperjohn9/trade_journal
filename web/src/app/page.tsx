import type { ReactNode } from 'react';
import Link from 'next/link';
import { MarketingShell } from '@/src/components/marketing/MarketingShell';
import { AuthCodeHandler } from '@/src/components/auth/AuthCodeHandler';

// Public marketing landing page for The Trader's Hindsight.
//
// Positioned around the wedge: the journal that shows, in money, what your
// trading habits cost you, then helps you stop and proves what you saved.
// Three pillars on show: Hindsight (diagnose the cost), Foresight (a co-pilot
// at the entry), and the Commitment loop (prove what you kept). Server
// component; theming follows the global light / dark / system tokens.

export default function LandingPage() {
  return (
    <MarketingShell>
      <AuthCodeHandler />
      <Hero />
      <BrokersStrip />
      <ProblemStrip />
      <Pillars />
      <HowItWorks />
      <Features />
      <PhilosophyStrip />
      <FinalCta />
    </MarketingShell>
  );
}

/* ------------------------------------------------------------------ Hero -- */

function Hero() {
  return (
    <section className='relative overflow-hidden border-b border-[var(--border-default)]'>
      <GridBackdrop />
      <div
        aria-hidden
        className='pointer-events-none absolute right-[-160px] top-[-160px] -z-0 h-[560px] w-[680px] opacity-[0.16]'
        style={{
          background:
            'radial-gradient(closest-side, var(--accent) 0%, transparent 70%)',
        }}
      />
      <div className='relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28'>
        {/* Copy */}
        <div className='text-center lg:text-left'>
          <p className='mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]'>
            <span className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]' />
            For forex &amp; prop-firm traders
          </p>
          <h1 className='text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-[3.4rem]'>
            See what your habits cost you.{' '}
            <span className='bg-gradient-to-r from-[var(--accent)] to-[var(--text-primary)] bg-clip-text text-transparent'>
              In money.
            </span>
          </h1>
          <p className='mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg lg:mx-0'>
            The Trader&apos;s Hindsight reads your trades, finds the one habit
            quietly draining your account, and shows you in dollars what it
            cost. Then it helps you stop, and proves what you saved.
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start'>
            <Link
              href='/auth?mode=signup'
              className='rounded-lg bg-[var(--accent-cta)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90'>
              Start free
            </Link>
            <a
              href='#how-it-works'
              className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]'>
              See how it works
            </a>
          </div>
          <p className='mt-5 text-xs text-[var(--text-muted)]'>
            Start free. cTrader auto-sync and file import included. Cancel
            anytime.
          </p>
        </div>

        {/* Product visual */}
        <div className='relative mx-auto w-full max-w-md lg:mx-0'>
          <div
            aria-hidden
            className='absolute -inset-6 -z-0 rounded-[2rem] opacity-40 blur-3xl'
            style={{
              background:
                'radial-gradient(closest-side, var(--accent) 0%, transparent 75%)',
            }}
          />
          <ReceiptCard />
        </div>
      </div>
    </section>
  );
}

// Faint dotted grid that fades out toward the bottom, for hero texture.
function GridBackdrop() {
  return (
    <div
      aria-hidden
      className='pointer-events-none absolute inset-0 -z-0 opacity-50'
      style={{
        backgroundImage:
          'radial-gradient(var(--border-default) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        WebkitMaskImage:
          'linear-gradient(to bottom, black 0%, transparent 75%)',
        maskImage: 'linear-gradient(to bottom, black 0%, transparent 75%)',
      }}
    />
  );
}

// The shareable Hindsight card, the product's core "aha".
function ReceiptCard() {
  return (
    <div className='relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-7 text-left shadow-2xl'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]'>
          <span className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]' />
          The Trader&apos;s Hindsight
        </div>
        <span className='rounded-full border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]'>
          Hindsight report
        </span>
      </div>
      <div className='mt-7 text-center'>
        <div className='text-base font-medium text-[var(--text-secondary)]'>
          Trading on Thursdays
        </div>
        <div className='mt-1 text-[3.5rem] font-extrabold leading-none tracking-tight text-[var(--loss)]'>
          -$1,687
        </div>
        <div className='mt-3 text-sm text-[var(--text-muted)]'>
          is what this one habit cost me in the last 30 days.
        </div>
      </div>
      <div className='mt-6 grid grid-cols-2 gap-3'>
        <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-center'>
          <div className='text-[11px] uppercase tracking-wide text-[var(--text-muted)]'>
            My P&amp;L
          </div>
          <div className='mt-0.5 text-lg font-bold text-[var(--loss)]'>
            -$1,437
          </div>
        </div>
        <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-center'>
          <div className='text-[11px] uppercase tracking-wide text-[var(--text-muted)]'>
            Without it
          </div>
          <div className='mt-0.5 text-lg font-bold text-[var(--profit)]'>
            +$250
          </div>
        </div>
      </div>
      <p className='mt-4 text-center text-[11px] text-[var(--text-muted)]'>
        Illustrative. Your report is built from your own trades.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- Brokers -- */

function BrokersStrip() {
  const brokers = [
    'MetaTrader 4 & 5',
    'cTrader',
    'TradeLocker',
    'DXtrade',
    'MatchTrader',
  ];
  return (
    <section className='border-b border-[var(--border-default)] bg-[var(--bg-subtle)]'>
      <div className='mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-7 sm:flex-row sm:justify-between'>
        <p className='text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]'>
          Auto-sync &amp; import from
        </p>
        <div className='flex flex-wrap items-center justify-center gap-x-7 gap-y-2'>
          {brokers.map((b) => (
            <span
              key={b}
              className='text-sm font-semibold text-[var(--text-secondary)]'>
              {b}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Problem -- */

function ProblemStrip() {
  const stats = [
    { big: '$4,270', small: 'average spent on challenge fees before a payout' },
    { big: '~1 in 14', small: 'traders pass a prop evaluation' },
    { big: '71%', small: 'of first-phase failures are a daily-drawdown breach' },
  ];
  return (
    <section className='border-b border-[var(--border-default)]'>
      <div className='mx-auto max-w-5xl px-6 py-16'>
        <p className='mx-auto max-w-2xl text-center text-lg font-medium leading-snug text-[var(--text-primary)] sm:text-xl'>
          Most blown accounts are not a strategy problem. They are a habit you
          cannot see, revenge trading, sizing up after a loss, a session that
          bleeds you.
        </p>
        <div className='mt-12 grid gap-6 sm:grid-cols-3'>
          {stats.map((s) => (
            <div
              key={s.big}
              className='rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-6 text-center'>
              <div className='text-3xl font-bold text-[var(--text-primary)] sm:text-4xl'>
                {s.big}
              </div>
              <div className='mx-auto mt-2 max-w-[15rem] text-sm text-[var(--text-muted)]'>
                {s.small}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Pillars -- */

// The three things the product actually does, each with a concrete mock so a
// visitor sees it, not just reads about it.
function Pillars() {
  return (
    <section className='border-b border-[var(--border-default)] bg-[var(--bg-subtle)]'>
      <div className='mx-auto max-w-6xl space-y-16 px-6 py-16 sm:py-20'>
        <PillarRow
          eyebrow='Hindsight · Diagnose'
          title='The one habit costing you the most, priced in dollars.'
          body='We replay your month without each leak and rank them by the money they cost. Not "you revenge-trade", but "revenge trading cost you $1,687 in 30 days". Then we show the same trades the way they should have gone.'
          card={<LeaksCard />}
        />
        <PillarRow
          reverse
          eyebrow='Foresight · Before you click buy'
          title='An optional co-pilot that reads the trade before you take it.'
          body='Paste a planned trade, or let it watch a live account. It checks your risk and reward, whether the entry fits your own trend, your prop firm news rule, and the behavioral traps, revenge, tilt, sizing up. One calm heads-up before the click, not a lecture after the loss.'
          card={<ForesightCard />}
        />
        <PillarRow
          eyebrow='Commitment · Prove it'
          title='Commit to one rule. We prove what you kept.'
          body='Turn any finding into a rule with one tap. We track it automatically from every new trade, count the breaches you avoided, and add up the dollars you saved by sticking to it. Receipts no other journal can show you.'
          card={<CommitmentCard />}
        />
      </div>
    </section>
  );
}

function PillarRow({
  eyebrow,
  title,
  body,
  card,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  card: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className='grid items-center gap-8 lg:grid-cols-2 lg:gap-14'>
      <div className={reverse ? 'lg:order-2' : ''}>
        <p className='text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]'>
          {eyebrow}
        </p>
        <h3 className='mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]'>
          {title}
        </h3>
        <p className='mt-4 text-base leading-relaxed text-[var(--text-secondary)]'>
          {body}
        </p>
      </div>
      <div className={reverse ? 'lg:order-1' : ''}>{card}</div>
    </div>
  );
}

function LeaksCard() {
  const leaks = [
    { name: 'Trading on Thursdays', cost: '-$1,687' },
    { name: 'Revenge trades after a loss', cost: '-$910' },
    { name: 'Sizing up after a loss', cost: '-$642' },
    { name: 'Asian session', cost: '-$418' },
  ];
  return (
    <div className='rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-6 shadow-xl'>
      <div className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]'>
        Your costliest habits · last 30 days
      </div>
      <ul className='mt-4 space-y-2.5'>
        {leaks.map((l, i) => (
          <li
            key={l.name}
            className='flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3'>
            <span className='flex items-center gap-3 text-sm text-[var(--text-primary)]'>
              <span className='font-mono text-xs text-[var(--text-muted)]'>
                {i + 1}
              </span>
              {l.name}
            </span>
            <span className='text-sm font-semibold text-[var(--loss)]'>
              {l.cost}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ForesightCard() {
  return (
    <div className='rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-6 shadow-xl'>
      <div className='flex items-center justify-between'>
        <div className='text-sm font-semibold text-[var(--text-primary)]'>
          Foresight read · EURUSD short
        </div>
        <span className='inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--profit)]'>
          <span className='inline-block h-1.5 w-1.5 rounded-full bg-[var(--profit)]' />
          Live
        </span>
      </div>
      <div className='mt-2 text-xs text-[var(--text-muted)]'>
        Risk 1.8% · 2.1R to target
      </div>
      <ul className='mt-4 space-y-2 text-sm'>
        <li className='flex items-start gap-2.5 text-[var(--text-secondary)]'>
          <Dot tone='loss' />
          18 minutes to red-folder USD news
        </li>
        <li className='flex items-start gap-2.5 text-[var(--text-secondary)]'>
          <Dot tone='loss' />
          3rd trade today after two losses (tilt)
        </li>
        <li className='flex items-start gap-2.5 text-[var(--text-secondary)]'>
          <Dot tone='profit' />
          Aligned with your 4H downtrend
        </li>
      </ul>
      <p className='mt-4 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)]'>
        Two reasons to wait: news in 18 minutes and you&apos;re on tilt. Let the
        print pass or size down.
      </p>
    </div>
  );
}

function Dot({ tone }: { tone: 'loss' | 'profit' }) {
  return (
    <span
      aria-hidden
      className='mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full'
      style={{
        backgroundColor: tone === 'loss' ? 'var(--loss)' : 'var(--profit)',
      }}
    />
  );
}

function CommitmentCard() {
  return (
    <div className='rounded-2xl border border-[var(--border-default)] bg-[var(--surface-elevated)] p-6 shadow-xl'>
      <div className='text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]'>
        Committed rule · 3 weeks
      </div>
      <div className='mt-3 text-base font-semibold text-[var(--text-primary)]'>
        No trades within an hour of a loss
      </div>
      <div className='mt-5 grid grid-cols-2 gap-4'>
        <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3'>
          <div className='text-xs text-[var(--text-muted)]'>Breaches / week</div>
          <div className='mt-1 text-xl font-bold text-[var(--text-primary)]'>
            0{' '}
            <span className='text-xs font-medium text-[var(--text-muted)]'>
              was 2.4
            </span>
          </div>
        </div>
        <div className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3'>
          <div className='text-xs text-[var(--text-muted)]'>Kept so far</div>
          <div className='mt-1 text-xl font-bold text-[var(--profit)]'>
            +$1,120
          </div>
        </div>
      </div>
      <div className='mt-4 h-2 overflow-hidden rounded-full bg-[var(--bg-surface)]'>
        <div
          className='h-full rounded-full bg-[var(--profit)]'
          style={{ width: '86%' }}
        />
      </div>
      <p className='mt-2 text-xs text-[var(--text-muted)]'>
        86% adherence since you committed.
      </p>
    </div>
  );
}

/* --------------------------------------------------------- How it works -- */

function HowItWorks() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: '01',
      title: 'Connect or import',
      body: 'Auto-sync cTrader free, sync one MetaTrader account, or import a report from any platform. New trades flow in on their own.',
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
    <section
      id='how-it-works'
      className='border-b border-[var(--border-default)]'>
      <div className='mx-auto max-w-5xl px-6 py-16 sm:py-20'>
        <div className='text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]'>
            How it works
          </p>
          <h2 className='mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'>
            <span>Connect</span>
            <FlowArrow />
            <span>Diagnose</span>
            <FlowArrow />
            <span>Commit</span>
            <FlowArrow />
            <span>Prove</span>
          </h2>
          <p className='mx-auto mt-4 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base'>
            Get your trades in, see what your habits cost you, commit to fixing
            the biggest one, and watch the money you keep add up.
          </p>
        </div>

        <ol className='mt-12 grid gap-4 md:grid-cols-4'>
          {steps.map((step) => (
            <li
              key={step.n}
              className='rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5'>
              <div className='font-mono text-xs font-semibold tracking-wider text-[var(--accent)]'>
                {step.n}
              </div>
              <div className='mt-2 text-lg font-semibold text-[var(--text-primary)]'>
                {step.title}
              </div>
              <p className='mt-2 text-sm leading-relaxed text-[var(--text-secondary)]'>
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
      className='hidden text-[var(--accent)] sm:inline-flex sm:items-center'>
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

/* ------------------------------------------------------------- Features -- */

function Features() {
  const features: Array<{ icon: string; title: string; body: string }> = [
    {
      icon: '💸',
      title: 'Cost in dollars, not vibes',
      body: 'We recalculate your month without each habit and rank them by what they cost, so you fix the most expensive one first.',
    },
    {
      icon: '🏷️',
      title: 'Auto-tagged trades',
      body: 'Every trade is labeled the moment it lands, session, instrument, and the behavioral traps like revenge, oversized, and tilt.',
    },
    {
      icon: '🔌',
      title: 'Auto-sync and free import',
      body: 'cTrader sync free, a MetaTrader account included (two on Master), plus free import from MT5, cTrader, TradeLocker, DXtrade, and MatchTrader.',
    },
    {
      icon: '🏆',
      title: 'Built for prop firms',
      body: 'Challenge and funded drawdown tracking, automatic protection when you breach, and a Prop Career ledger of fees paid versus payouts.',
    },
    {
      icon: '🤖',
      title: 'An AI coach for your journal',
      body: 'A read of your whole history: where your edge is, the habits bleeding you, and a full debrief when a challenge passes or breaches.',
    },
    {
      icon: '🔒',
      title: 'Your data, private',
      body: 'Encrypted at rest, two-factor sign-in, export anything anytime. We never sell or analyze your trades.',
    },
  ];

  return (
    <section className='border-b border-[var(--border-default)] bg-[var(--bg-subtle)]'>
      <div className='mx-auto max-w-6xl px-6 py-16 sm:py-20'>
        <div className='text-center'>
          <p className='text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]'>
            What you get
          </p>
          <h2 className='mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'>
            More than a record. A reason you get better.
          </h2>
        </div>

        <div className='mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {features.map((f) => (
            <div
              key={f.title}
              className='rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 transition-colors hover:border-[var(--border-strong)]'>
              <div className='mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--bg-subtle)] text-xl'>
                {f.icon}
              </div>
              <div className='text-base font-semibold text-[var(--text-primary)]'>
                {f.title}
              </div>
              <p className='mt-2 text-sm leading-relaxed text-[var(--text-secondary)]'>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- Philosophy -- */

function PhilosophyStrip() {
  return (
    <section className='border-b border-[var(--border-default)]'>
      <div className='mx-auto max-w-3xl px-6 py-16 text-center sm:py-20'>
        <p className='text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]'>
          Why we built this
        </p>
        <p className='mt-5 text-2xl font-medium leading-snug text-[var(--text-primary)] sm:text-3xl'>
          &ldquo;Most journals are a mirror. They show you the past and change
          nothing. We built the one that names the habit costing you money,
          helps you stop, and shows you what you saved.&rdquo;
        </p>
        <p className='mt-4 text-sm text-[var(--text-muted)]'>
          Built by a prop trader who lost the fees first.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Final CTA -- */

function FinalCta() {
  return (
    <section className='relative overflow-hidden border-b border-[var(--border-default)]'>
      <div
        aria-hidden
        className='pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 opacity-[0.14]'
        style={{
          background:
            'radial-gradient(closest-side, var(--accent) 0%, transparent 70%)',
        }}
      />
      <div className='relative mx-auto max-w-3xl px-6 py-16 text-center sm:py-20'>
        <h2 className='text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[2.75rem] sm:leading-[1.1]'>
          Find the leak before it blows{' '}
          <span className='bg-gradient-to-r from-[var(--accent)] to-[var(--text-primary)] bg-clip-text text-transparent'>
            another challenge.
          </span>
        </h2>
        <p className='mx-auto mt-4 max-w-xl text-sm text-[var(--text-secondary)] sm:text-base'>
          A blown 100K challenge runs $500 or more, and most traders pay it more
          than once. Finding the habit behind the breach costs $12 a month.
          Start free and see your first Hindsight Report today.
        </p>
        <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
          <Link
            href='/auth?mode=signup'
            className='rounded-lg bg-[var(--accent-cta)] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90'>
            Start free
          </Link>
          <Link
            href='/pricing'
            className='rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]'>
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
