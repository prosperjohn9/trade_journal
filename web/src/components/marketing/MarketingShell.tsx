import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

// Shared nav + footer + container for any public marketing-side page (landing,
// pricing, legal). Themed with the global design tokens, so it follows the
// light / dark / system choice from the header toggle.

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className='min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] antialiased'>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingNav() {
  return (
    <nav
      className='sticky top-0 z-30 border-b border-[var(--border-default)] backdrop-blur'
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-app) 85%, transparent)',
      }}>
      <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-4'>
        <Link
          href='/'
          className='flex items-center gap-2.5 text-lg font-semibold text-[var(--text-primary)]'>
          <Image
            src='/logo-mark-dark.png'
            alt=''
            width={44}
            height={44}
            priority
            className='h-11 w-11'
          />
          <span>The Trader&apos;s Hindsight</span>
        </Link>
        <div className='flex items-center gap-2'>
          <Link
            href='/pricing'
            className='hidden rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:inline-flex'>
            Pricing
          </Link>
          <Link
            href='/auth'
            className='hidden rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] sm:inline-flex'>
            Sign in
          </Link>
          <ThemeToggle />
          <Link
            href='/auth?mode=signup'
            className='rounded-lg bg-[var(--accent-cta)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90'>
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className='border-t border-[var(--border-default)] bg-[var(--bg-subtle)]'>
      <div className='mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center'>
        <div>
          <div className='font-semibold text-[var(--text-primary)]'>
            The Trader&apos;s Hindsight
          </div>
          <div className='mt-1 text-xs text-[var(--text-muted)]'>
            Make your experience your edge.
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--text-secondary)]'>
          <Link href='/pricing' className='hover:text-[var(--text-primary)]'>
            Pricing
          </Link>
          <Link href='/auth' className='hover:text-[var(--text-primary)]'>
            Sign in
          </Link>
          <Link href='/contact' className='hover:text-[var(--text-primary)]'>
            Contact
          </Link>
          <Link href='/privacy' className='hover:text-[var(--text-primary)]'>
            Privacy
          </Link>
          <Link href='/terms' className='hover:text-[var(--text-primary)]'>
            Terms
          </Link>
          <Link href='/refunds' className='hover:text-[var(--text-primary)]'>
            Refunds
          </Link>
          <Link href='/cookies' className='hover:text-[var(--text-primary)]'>
            Cookies
          </Link>
          <span className='text-[var(--text-muted)]'>
            © {new Date().getFullYear()} The Trader&apos;s Hindsight
          </span>
        </div>
      </div>
    </footer>
  );
}

// Standard long-form prose container — readable line-length, themed
// heading/body styles. Wrap legal pages in this for a consistent look.
export function LegalContainer({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <section className='border-b border-[var(--border-default)]'>
      <article className='mx-auto max-w-3xl px-6 py-16 sm:py-20'>
        <h1 className='text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'>
          {title}
        </h1>
        <p className='mt-2 text-sm text-[var(--text-muted)]'>
          Effective {effectiveDate}
        </p>

        <div className='mt-10 space-y-8 text-[15px] leading-relaxed text-[var(--text-secondary)] [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:text-[var(--accent)] [&_a]:underline hover:[&_a]:opacity-80'>
          {children}
        </div>
      </article>
    </section>
  );
}
