import type { Metadata } from 'next';
import {
  LegalContainer,
  MarketingShell,
} from '@/src/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: "Privacy Policy — The Trader's Hindsight",
  description:
    'How The Trader\'s Hindsight collects, uses, stores, and protects your data.',
};

const EFFECTIVE_DATE = 'May 15, 2026';
const CONTACT_EMAIL = 'support@tradershindsight.com';

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <LegalContainer title='Privacy Policy' effectiveDate={EFFECTIVE_DATE}>
        <p>
          This Privacy Policy describes how The Trader&apos;s Hindsight
          (&ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;,
          &ldquo;<strong>our</strong>&rdquo;) collects, uses, stores, and
          shares your information when you use our website and trading
          journal service (the &ldquo;<strong>Service</strong>&rdquo;).
        </p>
        <p>
          We&apos;re built by traders, for traders. Your trades are private,
          and we don&apos;t sell or analyse them. This page explains exactly
          what that means in practice.
        </p>

        <h2>1. Information we collect</h2>
        <h3>Account information</h3>
        <p>
          When you sign up we collect your email address. If you set a
          display name, we collect that too. We don&apos;t require your
          legal name, address, phone number, or any other identifying
          information.
        </p>

        <h3>Trade data you enter</h3>
        <p>
          We store the trade and account data you enter into the Service:
          instrument, direction, entry/exit prices, P&amp;L, risk, screenshots,
          setup checklists, notes, lesson-learned text, and timestamps. This
          is your data; you own it.
        </p>

        <h3>Automatic technical data</h3>
        <p>
          Like most web apps, our infrastructure (Supabase, our hosting
          provider) records standard request metadata: IP address, browser
          type, timestamps. We use this for security, abuse prevention, and
          troubleshooting — not for advertising.
        </p>

        <h2>2. How we use your information</h2>
        <ul>
          <li>To provide and operate the Service (log in, sync trades, generate reports).</li>
          <li>To send you transactional emails related to your account (e.g. password reset, security alerts).</li>
          <li>To monitor the security and integrity of the Service.</li>
          <li>To improve the product based on aggregated, anonymous usage patterns (e.g. which pages are slow).</li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data. We do <strong>not</strong> send marketing emails based on your trade content. We do <strong>not</strong> show ads.
        </p>

        <h2>3. How we store and protect your data</h2>
        <p>
          Your data is stored in Supabase (PostgreSQL), encrypted at rest
          and in transit. Access is protected by Row-Level Security policies
          — only you can read your own trades and screenshots.
        </p>
        <p>
          Screenshots are stored in private object storage and served via
          time-limited signed URLs that expire after a short window.
        </p>

        <h2>4. Cookies and similar technologies</h2>
        <p>
          We use a single authentication cookie (managed by Supabase Auth)
          to keep you signed in. We do not use analytics cookies, advertising
          cookies, or third-party tracking pixels.
        </p>

        <h2>5. Third-party services</h2>
        <p>
          We rely on the following service providers to operate the
          Service. Each handles a slice of data on our behalf and is
          contractually bound to protect it:
        </p>
        <ul>
          <li>
            <strong>Supabase</strong> — database, authentication, file
            storage. <a href='https://supabase.com/privacy' target='_blank' rel='noreferrer noopener'>Supabase Privacy Policy</a>.
          </li>
          <li>
            <strong>Vercel</strong> (or our chosen hosting provider) —
            serves the website itself.
          </li>
        </ul>

        <h2>6. Your rights</h2>
        <p>You can, at any time:</p>
        <ul>
          <li><strong>Access</strong> all your data — it&apos;s visible in the app and exportable.</li>
          <li><strong>Correct</strong> any trade, account, or profile information.</li>
          <li><strong>Delete</strong> individual trades, accounts, or your entire account.</li>
          <li>
            <strong>Export</strong> your trades — CSV export will be
            available in-app; until then you can request a full export by
            emailing us.
          </li>
        </ul>
        <p>
          If you are in the European Economic Area, United Kingdom, or
          California, you have additional rights under GDPR or CCPA
          (including the right to object to processing, and the right to
          data portability). Email us to exercise any of these.
        </p>

        <h2>7. Data retention</h2>
        <p>
          We keep your data as long as your account is active. If you
          delete your account, we permanently delete your trades,
          screenshots, and personal information within 30 days, except where
          a longer retention is legally required.
        </p>

        <h2>8. Children</h2>
        <p>
          The Service is not intended for users under 18. We do not
          knowingly collect data from anyone under 18.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. When we make
          material changes, we&apos;ll update the &ldquo;Effective&rdquo;
          date at the top and notify signed-in users by email or in-app
          notice.
        </p>

        <h2>10. Contact</h2>
        <p>
          Questions, requests, or concerns? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalContainer>
    </MarketingShell>
  );
}
