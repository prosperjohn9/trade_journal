import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

// Shared nav + footer + dark container for any public marketing-side page
// (landing, privacy, terms). Always dark themed — independent of the
// dashboard's light/dark toggle.

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className='min-h-screen bg-[#0b1220] text-slate-100 antialiased'>
      <MarketingNav />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingNav() {
  return (
    <nav className='sticky top-0 z-30 border-b border-white/5 bg-[#0b1220]/85 backdrop-blur'>
      <div className='mx-auto flex max-w-6xl items-center justify-between px-6 py-4'>
        <Link href='/' className='flex items-center gap-2.5 text-lg font-semibold'>
          <Image
            src='/logo-mark-dark.png'
            alt=''
            width={52}
            height={52}
            priority
            className='h-[52px] w-[52px]'
          />
          <span>The Trader&apos;s Hindsight</span>
        </Link>
        <div className='flex items-center gap-2'>
          <Link
            href='/pricing'
            className='hidden rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white sm:inline-flex'>
            Pricing
          </Link>
          <Link
            href='/auth'
            className='hidden rounded-lg px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white sm:inline-flex'>
            Sign in
          </Link>
          <Link
            href='/auth?mode=signup'
            className='rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-indigo-400'>
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className='bg-[#0a111e]'>
      <div className='mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-slate-400 sm:flex-row sm:items-center'>
        <div>
          <div className='font-semibold text-white'>
            The Trader&apos;s Hindsight
          </div>
          <div className='mt-1 text-xs text-slate-500'>
            Make your experience your edge.
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400'>
          <Link href='/pricing' className='hover:text-white'>
            Pricing
          </Link>
          <Link href='/auth' className='hover:text-white'>
            Sign in
          </Link>
          <Link href='/contact' className='hover:text-white'>
            Contact
          </Link>
          <Link href='/privacy' className='hover:text-white'>
            Privacy
          </Link>
          <Link href='/terms' className='hover:text-white'>
            Terms
          </Link>
          <Link href='/refunds' className='hover:text-white'>
            Refunds
          </Link>
          <Link href='/cookies' className='hover:text-white'>
            Cookies
          </Link>
          <span className='text-slate-600'>
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
    <section className='border-b border-white/5'>
      <article className='mx-auto max-w-3xl px-6 py-16 sm:py-20'>
        <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
          {title}
        </h1>
        <p className='mt-2 text-sm text-slate-400'>
          Effective {effectiveDate}
        </p>

        <div className='mt-10 space-y-8 text-[15px] leading-relaxed text-slate-200 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_a]:text-indigo-300 [&_a]:underline hover:[&_a]:text-indigo-200'>
          {children}
        </div>
      </article>
    </section>
  );
}
