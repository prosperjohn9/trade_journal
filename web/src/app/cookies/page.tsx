import type { Metadata } from 'next';
import {
  LegalContainer,
  MarketingShell,
} from '@/src/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: "Cookie Policy — The Trader's Hindsight",
  description:
    "How The Trader's Hindsight uses cookies. One essential cookie keeps you signed in; our live chat sets its own cookies only if you open it. No analytics, no advertising, no tracking.",
};

const EFFECTIVE_DATE = 'May 20, 2026';
const CONTACT_EMAIL = 'support@tradershindsight.com';

export default function CookiesPage() {
  return (
    <MarketingShell>
      <LegalContainer title='Cookie Policy' effectiveDate={EFFECTIVE_DATE}>
        <p>
          This Cookie Policy explains how The Trader&apos;s Hindsight (&ldquo;
          <strong>Company</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;,
          &ldquo;<strong>us</strong>&rdquo;, and &ldquo;<strong>our</strong>
          &rdquo;) uses cookies and similar technologies when you visit our
          website at{' '}
          <a href='https://tradershindsight.com'>
            https://tradershindsight.com
          </a>{' '}
          (&ldquo;<strong>Website</strong>&rdquo;). It explains what these
          technologies are, why we use them, and how you can control them.
        </p>

        {/* ─── On-brand intro — sets us apart from "we track everything" SaaS ─── */}
        <div className='mt-8 rounded-xl border border-[var(--accent)] bg-[var(--accent-strip-bg)] p-5 text-sm leading-relaxed text-[var(--text-secondary)]'>
          <strong className='block font-semibold text-[var(--accent)]'>
            The short version
          </strong>
          <p className='mt-2'>
            We use <strong>one essential cookie</strong> to keep you signed in.
            The only other cookies come from our live chat, and they load only
            if you choose to start a chat with us. We don&apos;t use analytics
            cookies, advertising cookies, tracking pixels, web beacons, or any
            cross-site tracking, and we don&apos;t sell or share cookie data
            with anyone.
          </p>
        </div>

        <h2>What are cookies?</h2>
        <p>
          Cookies are small data files placed on your computer or mobile
          device when you visit a website. They are widely used by website
          owners to make their websites work, work more efficiently, or
          provide reporting information.
        </p>
        <p>
          Cookies set by the website owner (in this case, The Trader&apos;s
          Hindsight) are called &ldquo;<strong>first-party cookies</strong>
          &rdquo;. Cookies set by parties other than the website owner are
          called &ldquo;<strong>third-party cookies</strong>&rdquo;.
          Third-party cookies enable third-party features or functionality
          (such as advertising, interactive content, or analytics) to be
          provided on or through the website.
        </p>
        <p>
          <strong>By default, we set only one first-party cookie</strong> and do
          not load third-party cookies as you browse. The one exception is our
          live chat: if you open it, our chat provider (Tawk.to) sets its own
          cookies to run the chat session.
        </p>

        <h2>Why do we use cookies?</h2>
        <p>
          Our own sign-in cookie serves one purpose: <strong>keeping you
          signed in</strong>. This is what privacy laws call a &ldquo;strictly
          necessary&rdquo; or &ldquo;essential&rdquo; cookie. Without it, you
          would have to re-enter your credentials on every page load, which
          would make the Service unusable.
        </p>
        <p>
          We do <strong>not</strong> use cookies for:
        </p>
        <ul>
          <li>Analytics or usage tracking</li>
          <li>Advertising or retargeting</li>
          <li>Profiling or behavioural targeting</li>
          <li>Cross-site tracking</li>
          <li>Social media integration</li>
          <li>Selling, renting, or sharing your data</li>
        </ul>

        <h2>The cookies we use</h2>
        <p>The full list of cookies served through our Website:</p>
        <ul>
          <li>
            <strong>Supabase Auth Session Cookie</strong> — a strictly
            necessary, first-party session cookie managed by Supabase
            (our authentication provider) that keeps you signed in across
            page visits. It expires when you sign out or after a period of
            inactivity. It contains a session token that identifies your
            authenticated session — it does not contain personal data,
            tracking identifiers, or behavioural data.
          </li>
          <li>
            <strong>Live chat cookies (Tawk.to)</strong> — set only if you open
            our live chat. Our chat provider, Tawk.to, uses cookies to run the
            chat session and remember your conversation. They load only when you
            start a chat and are governed by Tawk.to&apos;s privacy policy. If
            you never open live chat, these are never set.
          </li>
        </ul>
        <p>
          Because this cookie is strictly necessary to provide the Service,
          we do not require your consent to set it (consent for
          strictly-necessary cookies is not required under EU/UK ePrivacy
          rules).
        </p>

        <h2>How can I control cookies?</h2>
        <p>
          You have the right to decide whether to accept or reject cookies.
          As we only use one strictly necessary cookie, rejecting it via
          your browser will prevent you from signing in to the Service, but
          will not otherwise affect your access to the public website
          (landing page, Privacy Policy, Terms of Service, etc.).
        </p>
        <p>
          You can set or amend your web browser controls to accept or refuse
          cookies. The means by which you can refuse cookies varies from
          browser to browser, so you should visit your browser&apos;s help
          menu for more information. The following links explain how to
          manage cookies on the most popular browsers:
        </p>
        <ul>
          <li>
            <a
              href='https://support.google.com/chrome/answer/95647'
              target='_blank'
              rel='noreferrer noopener'>
              Chrome
            </a>
          </li>
          <li>
            <a
              href='https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer'
              target='_blank'
              rel='noreferrer noopener'>
              Firefox
            </a>
          </li>
          <li>
            <a
              href='https://support.apple.com/guide/safari/manage-cookies-sfri11471'
              target='_blank'
              rel='noreferrer noopener'>
              Safari
            </a>
          </li>
          <li>
            <a
              href='https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09'
              target='_blank'
              rel='noreferrer noopener'>
              Edge
            </a>
          </li>
          <li>
            <a
              href='https://help.opera.com/en/latest/web-preferences/'
              target='_blank'
              rel='noreferrer noopener'>
              Opera
            </a>
          </li>
        </ul>

        <h2>What about other tracking technologies?</h2>
        <p>
          We do not use web beacons, tracking pixels, clear gifs, fingerprinting,
          Flash cookies, Local Shared Objects (LSOs), or any other tracking
          technology. The Website is intentionally lean: one auth cookie,
          standard server logs (for security and abuse prevention), and that
          is the entirety of our client-side tracking.
        </p>

        <h2>How often will you update this Cookie Policy?</h2>
        <p>
          We may update this Cookie Policy from time to time to reflect, for
          example, changes to the cookies we use or for other operational,
          legal, or regulatory reasons. Please revisit this Cookie Policy
          regularly to stay informed about our use of cookies and related
          technologies. The date at the top of this Cookie Policy indicates
          when it was last updated.
        </p>
        <p>
          If we make material changes to this policy, we will update the
          &ldquo;Effective&rdquo; date at the top and notify signed-in users
          by email or in-app notice.
        </p>

        <h2>Where can I get further information?</h2>
        <p>
          If you have any questions about our use of cookies or other
          technologies, please email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or by post
          to:
        </p>
        <p>
          The Trader&apos;s Hindsight
          <br />
          Delta State
          <br />
          Nigeria
          <br />
          Phone: +234 811 869 8266
        </p>
      </LegalContainer>
    </MarketingShell>
  );
}
