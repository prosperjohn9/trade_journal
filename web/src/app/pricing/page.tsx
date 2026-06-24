import type { Metadata } from 'next';
import { MarketingShell } from '@/src/components/marketing/MarketingShell';
import { PricingPlans } from '@/src/components/marketing/PricingPlans';

export const metadata: Metadata = {
  title: "Pricing | The Trader's Hindsight",
  description:
    'Simple plans for serious traders. Broker auto-sync, behavioral-leak AI, and prop-firm tracking.',
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className='border-b border-[var(--border-default)]'>
        <div className='mx-auto max-w-6xl px-6 py-16 sm:py-20'>
          <div className='mx-auto max-w-2xl text-center'>
            <h1 className='text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'>
              Pricing built for traders, not tourists
            </h1>
            <p className='mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)]'>
              Every plan unlocks broker auto-sync, behavioral-leak AI, prop-firm
              tracking, and the deep analytics. The tiers differ by how many
              accounts you sync, how often, and how much AI you use. Pick a plan
              and start now, cancel anytime.
            </p>
          </div>

          <div className='mt-12'>
            <PricingPlans />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
