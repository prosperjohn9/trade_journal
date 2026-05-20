import type { Metadata } from 'next';
import { MarketingShell } from '@/src/components/marketing/MarketingShell';
import { ContactForm } from '@/src/components/marketing/ContactForm';

export const metadata: Metadata = {
  title: "Contact — The Trader's Hindsight",
  description:
    "Get in touch with The Trader's Hindsight. Send a message for support, privacy requests, billing questions, or anything else.",
};

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className='border-b border-white/5'>
        <article className='mx-auto max-w-2xl px-6 py-16 sm:py-20'>
          <h1 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
            Contact us
          </h1>
          <p className='mt-4 text-base text-slate-300'>
            Questions, concerns, privacy requests, or just want to say hi?
            Send us a message and we&apos;ll get back to you within 2 business
            days.
          </p>
          <p className='mt-2 text-sm text-slate-400'>
            You can also email us directly at{' '}
            <a
              href='mailto:support@tradershindsight.com'
              className='text-indigo-300 underline-offset-4 hover:underline'>
              support@tradershindsight.com
            </a>
            .
          </p>

          <div className='mt-10'>
            <ContactForm />
          </div>
        </article>
      </section>
    </MarketingShell>
  );
}
