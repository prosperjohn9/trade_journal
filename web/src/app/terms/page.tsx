import type { Metadata } from 'next';
import {
  LegalContainer,
  MarketingShell,
} from '@/src/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: "Terms of Service — The Trader's Hindsight",
  description:
    "The terms under which you can use The Trader's Hindsight. Includes important disclaimers about trading risk.",
};

const EFFECTIVE_DATE = 'May 15, 2026';
const CONTACT_EMAIL = 'support@tradershindsight.com';

export default function TermsPage() {
  return (
    <MarketingShell>
      <LegalContainer title='Terms of Service' effectiveDate={EFFECTIVE_DATE}>
        <p>
          These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern
          your use of The Trader&apos;s Hindsight website and the trading
          journal service (the &ldquo;<strong>Service</strong>&rdquo;).
          By creating an account or otherwise using the Service, you agree
          to these Terms. If you don&apos;t agree, please don&apos;t use the
          Service.
        </p>

        {/* ─── This is the critical disclaimer for a trading product. Loud, early. ─── */}
        <div className='mt-8 rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm leading-relaxed text-amber-100'>
          <strong className='block font-semibold text-amber-200'>
            Important — this is not financial advice.
          </strong>
          <p className='mt-2'>
            The Trader&apos;s Hindsight is a journal and analytics tool.
            Nothing in the Service is investment, financial, legal, tax, or
            trading advice, and nothing in the Service is a recommendation
            to buy, sell, or hold any instrument. You are solely responsible
            for your trading decisions and outcomes. Trading carries
            substantial risk of loss; past performance is not indicative of
            future results.
          </p>
        </div>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 18 years old and capable of forming a legally
          binding contract to use the Service.
        </p>

        <h2>2. Your account</h2>
        <p>
          You&apos;re responsible for safeguarding your sign-in credentials
          and for any activity under your account. If you suspect unauthorised
          access, contact us immediately at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>3. Your content and data</h2>
        <p>
          The trades, screenshots, notes, and other content you upload
          (your &ldquo;<strong>Content</strong>&rdquo;) belong to you. You
          grant us a limited, non-exclusive licence to host, store, and
          display your Content solely to provide the Service to you. We do
          not claim ownership of your Content, and we will not use it for
          training models, advertising, or any purpose other than running
          the Service.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service to violate any law or third-party rights.</li>
          <li>Attempt to access another user&apos;s account or data.</li>
          <li>Reverse-engineer, scrape, or interfere with the Service.</li>
          <li>Upload content that is unlawful, abusive, or infringing.</li>
          <li>Resell or sublicense the Service.</li>
        </ul>

        <h2>5. Service availability</h2>
        <p>
          We work hard to keep the Service running, but we don&apos;t
          guarantee uninterrupted access. The Service may be unavailable for
          maintenance, upgrades, or reasons outside our control. We are not
          liable for any losses caused by downtime.
        </p>

        <h2>6. Termination</h2>
        <p>
          You can delete your account at any time from inside the Service.
          We may suspend or terminate your access if you breach these Terms,
          if continued provision becomes commercially impracticable, or if
          required by law. On termination, your right to use the Service
          ends immediately; data deletion follows the schedule in our{' '}
          <a href='/privacy'>Privacy Policy</a>.
        </p>

        <h2>7. Disclaimer of warranties</h2>
        <p>
          The Service is provided &ldquo;<strong>as is</strong>&rdquo; and
          &ldquo;<strong>as available</strong>&rdquo;. To the maximum extent
          permitted by law, we disclaim all warranties — express, implied,
          or statutory — including warranties of merchantability, fitness
          for a particular purpose, and non-infringement. We do not warrant
          that the Service will be error-free, secure, or that any
          calculation (P&amp;L, R-multiple, win rate, etc.) will be free
          from inaccuracy.
        </p>

        <h2>8. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, in no event will The
          Trader&apos;s Hindsight, its operators, or its service providers be
          liable for any indirect, incidental, consequential, special, or
          punitive damages — including lost profits, lost trading
          opportunities, lost data, or loss of goodwill — arising out of or
          in connection with the Service, even if advised of the possibility
          of such damages.
        </p>
        <p>
          Our total aggregate liability for any direct damages will not
          exceed the amount you paid us in the twelve months preceding the
          claim, or USD 50 if you have not paid us anything.
        </p>

        <h2>9. Changes to the Service or these Terms</h2>
        <p>
          We may modify the Service or these Terms at any time. If we make
          material changes to the Terms, we&apos;ll update the
          &ldquo;Effective&rdquo; date and notify signed-in users by email or
          in-app notice. Continued use after the change means you accept
          the updated Terms.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction in which
          the Service operator is established, without regard to conflict-of-law
          principles. Any disputes will be brought exclusively in the courts
          of that jurisdiction.
        </p>

        <h2>11. Contact</h2>
        <p>
          For questions about these Terms, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalContainer>
    </MarketingShell>
  );
}
