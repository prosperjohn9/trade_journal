import type { Metadata } from 'next';
import {
  LegalContainer,
  MarketingShell,
} from '@/src/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — The Trader's Hindsight",
  description:
    "How billing, cancellation, and refunds work at The Trader's Hindsight. Cancel anytime, keep access until the end of your paid term, and the specific cases where we issue a refund.",
};

const EFFECTIVE_DATE = 'June 18, 2026';
const CONTACT_EMAIL = 'support@tradershindsight.com';

export default function RefundsPage() {
  return (
    <MarketingShell>
      <LegalContainer
        title='Refund & Cancellation Policy'
        effectiveDate={EFFECTIVE_DATE}>
        <p>
          This policy explains how billing, cancellation, and refunds work for
          paid subscriptions and add-ons purchased on The Trader&apos;s
          Hindsight at{' '}
          <a href='https://tradershindsight.com'>
            https://tradershindsight.com
          </a>{' '}
          (the &ldquo;Service&rdquo;), operated from Delta State, Nigeria. It
          is written to be specific to our Service. Where this
          policy and our{' '}
          <a href='/terms'>Terms of Service</a> differ on refunds or
          cancellation, this policy controls.
        </p>

        <h2>1. What you are paying for</h2>
        <p>
          The Service is a software subscription. We offer three plans, Pro,
          Elite, and Master, each available on a monthly or yearly billing
          cycle, plus optional add-ons (for example, an extra synced trading
          account). Subscriptions are billed in advance for the cycle you
          choose. There is no free trial; you get full access the moment your
          payment is confirmed.
        </p>

        <h2>2. Renewal</h2>
        <p>
          <strong>Card payments (via Flutterwave)</strong> renew automatically
          at the end of each billing cycle, at the then-current price for your
          plan, until you cancel. We disclose the billing amount and frequency
          on the checkout screen before you pay.
        </p>
        <p>
          <strong>Cryptocurrency payments (via NOWPayments)</strong> do not
          auto-renew. Each crypto payment buys a single term. When that term
          ends, your plan simply lapses unless you choose to pay again.
        </p>

        <h2>3. How to cancel</h2>
        <p>
          You can cancel at any time, with no cancellation fee, in either of
          these ways:
        </p>
        <ul>
          <li>
            Sign in and go to <strong>Settings, then Billing</strong>, and
            choose to cancel your subscription; or
          </li>
          <li>
            Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
            from the address on your account and ask us to cancel.
          </li>
        </ul>
        <p>
          Cancelling stops the next automatic renewal. Your plan stays active
          and you keep full access until the end of the term you have already
          paid for, after which it will not renew. Crypto plans are cancelled
          simply by not paying for another term.
        </p>

        <h2>4. Refunds</h2>
        <p>
          Because the Service is a digital product delivered immediately and
          used continuously throughout your term, fees already paid for the
          current term are generally non-refundable, and we do not provide
          partial or pro-rated refunds for the unused part of a term after you
          cancel.
        </p>
        <p>
          We will, however, issue a refund of the affected charge in any of the
          following cases:
        </p>
        <ul>
          <li>
            <strong>Duplicate or accidental charge.</strong> You were billed
            more than once for the same period, or charged in error.
          </li>
          <li>
            <strong>Billing after cancellation.</strong> You were charged for a
            renewal after you had already cancelled.
          </li>
          <li>
            <strong>Failure on our side.</strong> A confirmed technical fault
            on our end prevented you from accessing the Service for a sustained
            period and we could not resolve it.
          </li>
          <li>
            <strong>Unauthorized charge.</strong> The payment was made without
            the account holder&apos;s authorization and this is verified.
          </li>
          <li>
            Any case where a refund is required by the consumer-protection laws
            of the Federal Republic of Nigeria or other applicable law.
          </li>
        </ul>
        <p>
          Add-ons follow the same rules as the plan they attach to: cancellable
          at any time, active until the end of the paid term, and refundable
          only in the cases listed above.
        </p>

        <h2>5. How to request a refund</h2>
        <p>
          Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the
          email address on your account, with the date of the charge and a
          short description of the problem. We aim to respond within 2 business
          days. Approved refunds are returned to your original payment method.
          Card refunds are typically processed within 5 to 10 business days,
          though the exact timing depends on your bank or card issuer.
        </p>

        <h2>6. Cryptocurrency payments</h2>
        <p>
          Cryptocurrency transactions are irreversible by design, so we cannot
          reverse a completed crypto payment to the originating wallet. Where a
          refund is due under section 4 for a crypto payment, we will instead
          credit the equivalent value to your account or, at your choice and
          where practical, send the equivalent to a wallet address you confirm.
          Differences in network fees and exchange rates at the time of payout
          are not refundable.
        </p>

        <h2>7. Before you raise a chargeback</h2>
        <p>
          If you believe a charge is wrong, please contact us first at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We can almost
          always sort it out faster than a bank dispute. Filing a chargeback
          without contacting us may lead to your account being suspended while
          the dispute is investigated.
        </p>

        <h2>8. Contact</h2>
        <p>
          The Trader&apos;s Hindsight
          <br />
          Delta State, Nigeria
          <br />
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          <br />
          +234 811 869 8266
        </p>
      </LegalContainer>
    </MarketingShell>
  );
}
