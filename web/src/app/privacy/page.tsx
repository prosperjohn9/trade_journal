import type { Metadata } from 'next';
import {
  LegalContainer,
  MarketingShell,
} from '@/src/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: "Privacy Policy — The Trader's Hindsight",
  description:
    "How The Trader's Hindsight collects, uses, stores, and protects your data. Built by traders, for traders — your trades are private.",
};

const EFFECTIVE_DATE = 'May 20, 2026';
const CONTACT_EMAIL = 'support@tradershindsight.com';

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <LegalContainer title='Privacy Policy' effectiveDate={EFFECTIVE_DATE}>
        <p>
          This Privacy Notice for The Trader&apos;s Hindsight (&ldquo;
          <strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;, or
          &ldquo;<strong>our</strong>&rdquo;) describes how and why we might
          access, collect, store, use, and/or share (&ldquo;<strong>process
          </strong>&rdquo;) your personal information when you use our services
          (&ldquo;<strong>Services</strong>&rdquo;), including when you visit
          our website at{' '}
          <a href='https://tradershindsight.com'>
            https://tradershindsight.com
          </a>{' '}
          or use The Trader&apos;s Hindsight as a trading journal and analytics
          platform.
        </p>

        {/* ─── Brand-voice intro callout — our differentiator vs. typical SaaS ─── */}
        <div className='mt-8 rounded-xl border border-indigo-400/30 bg-indigo-400/5 p-5 text-sm leading-relaxed text-slate-200'>
          <strong className='block font-semibold text-indigo-200'>
            Built by traders, for traders.
          </strong>
          <p className='mt-2'>
            Your trades are private. We don&apos;t sell, share, or analyse
            your trade data for any purpose other than providing the Service
            to you. We don&apos;t use it to train AI models, we don&apos;t
            run ads, and we don&apos;t profile you for marketing. This page
            explains exactly what that means in practice.
          </p>
        </div>

        <p>
          Questions or concerns? Reading this Privacy Notice will help you
          understand your privacy rights and choices. We are responsible for
          making decisions about how your personal information is processed.
          If you do not agree with our policies and practices, please do not
          use our Services. If you still have any questions or concerns,
          please contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Summary of key points</h2>
        <ul>
          <li>
            <strong>What personal information do we process?</strong> We
            process the data you provide when you sign up (email, optional
            display name), the trade data you enter into the Service, and
            standard request metadata (IP, browser type, timestamps).{' '}
          </li>
          <li>
            <strong>Do we process any sensitive personal information?</strong>{' '}
            No. We do not process sensitive personal information (race,
            religion, health, biometric data, etc.).
          </li>
          <li>
            <strong>Do we collect information from third parties?</strong> No.
          </li>
          <li>
            <strong>How do we process your information?</strong> To provide
            the Service, communicate with you about your account, prevent
            fraud and abuse, and comply with law. We do not process your data
            for advertising or AI model training.
          </li>
          <li>
            <strong>Who do we share your information with?</strong> Only the
            service providers we use to operate the platform (Supabase,
            Vercel, Anthropic, Sentry, Flutterwave, NOWPayments, Google,
            Apple, Tawk.to). We do not sell or share data with anyone else.
          </li>
          <li>
            <strong>How do we keep your information safe?</strong> Encryption
            at rest and in transit, Row-Level Security policies in the
            database, private object storage, time-limited signed URLs for
            screenshots. No system is ever 100% secure, but we follow
            industry-standard practices.
          </li>
          <li>
            <strong>What are your rights?</strong> Depending on your location
            you have rights of access, correction, deletion, portability, and
            more. See &ldquo;What are your privacy rights?&rdquo; below.
          </li>
        </ul>

        <h2>1. What information do we collect?</h2>
        <h3>Personal information you disclose to us</h3>
        <p>
          We collect personal information that you voluntarily provide to us
          when you register on the Services, express an interest in obtaining
          information about us or our products and Services, when you
          participate in activities on the Services, or otherwise when you
          contact us. The personal information we collect may include:
        </p>
        <ul>
          <li>Names (display name, if you choose to set one)</li>
          <li>Email addresses (required for sign-in)</li>
          <li>Passwords (for the email + password sign-in method only)</li>
          <li>
            Contact or authentication data (OAuth tokens from Google/Apple,
            magic link tokens)
          </li>
        </ul>
        <p>
          <strong>Sensitive Information.</strong> We do not process sensitive
          information.
        </p>
        <p>
          <strong>Payment Data.</strong> We may collect data necessary to
          process your payment if you choose to make purchases. All payment
          data is handled and stored by Flutterwave (for card payments) and
          NOWPayments (for cryptocurrency payments). You may find their
          privacy notices here:{' '}
          <a
            href='https://flutterwave.com/us/privacy-notice'
            target='_blank'
            rel='noreferrer noopener'>
            Flutterwave Privacy Notice
          </a>{' '}
          and{' '}
          <a
            href='https://nowpayments.io/doc/fd-privacy-policy.pdf'
            target='_blank'
            rel='noreferrer noopener'>
            NOWPayments Privacy Policy
          </a>
          .
        </p>
        <p>
          <strong>Social Media Login Data.</strong> We provide you with the
          option to register and sign in using your existing Google or Apple
          account. If you choose to register in this way, we will collect
          certain profile information about you from the social media provider
          (typically your name and email address), as described in the section
          &ldquo;How do we handle your social logins?&rdquo; below.
        </p>
        <p>
          <strong>Trade data you enter.</strong> We store the trade and
          account data you enter into the Service: instrument, direction,
          entry/exit prices, P&amp;L, risk amounts, screenshots, setup
          checklists, notes, lesson-learned text, and timestamps. This is
          your data; you own it. We will not use it for training AI models,
          for advertising, or for any purpose other than providing the
          Service to you.
        </p>
        <h3>Information automatically collected</h3>
        <p>
          We automatically collect certain information when you visit, use,
          or navigate the Services. This information does not reveal your
          specific identity but may include device and usage information,
          such as your IP address, browser and device characteristics,
          operating system, language preferences, referring URLs, country,
          information about how and when you use our Services, and other
          technical information. This information is primarily needed to
          maintain the security and operation of our Services and for our
          internal analytics and reporting purposes.
        </p>
        <p>
          Like most web apps, our infrastructure (Supabase and Vercel)
          records standard request metadata: IP address, browser type, and
          timestamps. We use this for security, abuse prevention, and
          troubleshooting — not for advertising.
        </p>
        <p>
          You can find out more about cookies in our{' '}
          <a href='/cookies'>Cookie Policy</a>.
        </p>
        <p>The information we collect includes:</p>
        <ul>
          <li>
            <strong>Log and Usage Data.</strong> Service-related, diagnostic,
            usage, and performance information our servers automatically
            collect when you access or use our Services. This includes your
            IP address, device information, browser type and settings, and
            information about your activity in the Services (such as
            date/time stamps, pages viewed, features used).
          </li>
        </ul>
        <h3>Google API</h3>
        <p>
          Our use of information received from Google APIs will adhere to the{' '}
          <a
            href='https://developers.google.com/terms/api-services-user-data-policy'
            target='_blank'
            rel='noreferrer noopener'>
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>2. How do we process your information?</h2>
        <p>We process your personal information for the following purposes:</p>
        <ul>
          <li>
            <strong>To facilitate account creation and authentication and
            otherwise manage user accounts</strong> — so you can create and
            log in to your account, and we can keep your account in working
            order.
          </li>
          <li>
            <strong>To deliver and facilitate delivery of services to the
            user</strong> — to provide you with the requested service (log
            trades, view analytics, generate reports, run AI features when
            opted in).
          </li>
          <li>
            <strong>To respond to user inquiries and offer support</strong> —
            to respond to your inquiries and solve any potential issues.
          </li>
          <li>
            <strong>To send administrative information</strong> — security
            alerts, billing notifications, terms and policy changes, and
            other account-related communications.
          </li>
          <li>
            <strong>To request feedback</strong> — to contact you about your
            use of our Services and improve them.
          </li>
          <li>
            <strong>To protect our Services</strong> — to keep our Services
            safe and secure, including fraud monitoring and prevention.
          </li>
          <li>
            <strong>To identify usage trends</strong> — to better understand
            how the Services are being used so we can improve them, based on
            aggregated, anonymised patterns.
          </li>
          <li>
            <strong>To save or protect an individual&apos;s vital interest
            </strong> — when necessary to prevent harm.
          </li>
        </ul>

        <h2>3. What legal bases do we rely on to process your information?</h2>
        <p>
          <strong>If you are located in the EU or UK</strong>, this section
          applies to you.
        </p>
        <p>
          The General Data Protection Regulation (GDPR) and UK GDPR require
          us to explain the valid legal bases we rely on in order to process
          your personal information. We may rely on the following legal
          bases:
        </p>
        <ul>
          <li>
            <strong>Consent.</strong> We process your information if you have
            given us permission to use your personal information for a
            specific purpose (e.g. opting in to AI features). You can
            withdraw your consent at any time.
          </li>
          <li>
            <strong>Performance of a Contract.</strong> We process your
            personal information to fulfil our contractual obligations to you,
            including providing the Services.
          </li>
          <li>
            <strong>Legitimate Interests.</strong> We process your information
            when reasonably necessary to achieve our legitimate business
            interests, including security/fraud prevention, service
            improvement, and analysing usage to retain users.
          </li>
          <li>
            <strong>Legal Obligations.</strong> We process your information
            where necessary for compliance with legal obligations.
          </li>
          <li>
            <strong>Vital Interests.</strong> We process your information
            where necessary to protect your vital interests or those of a
            third party.
          </li>
        </ul>
        <p>
          <strong>If you are located in Canada</strong>, this section applies
          to you. We may process your information if you have given us express
          consent, or in situations where consent can be inferred. You can
          withdraw your consent at any time. In limited exceptional cases we
          may be legally permitted under applicable law to process your
          information without consent (for fraud detection, legal compliance,
          investigations, etc.).
        </p>

        <h2>4. When and with whom do we share your personal information?</h2>
        <p>
          We may share information in specific situations described in this
          section and/or with the following third parties.
        </p>
        <p>
          <strong>Vendors, Consultants, and Other Third-Party Service
          Providers.</strong> We share your data with third-party vendors who
          perform services for us or on our behalf and require access to such
          information to do that work. We have contracts in place with them
          (including Data Processing Agreements where required) which are
          designed to safeguard your personal information. They cannot do
          anything with your personal information unless we have instructed
          them to. They will not share your personal information with any
          organisation apart from us and they commit to protect the data they
          hold on our behalf.
        </p>
        <p>The third parties we share personal information with are:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — authentication, database, and file
            storage. <a href='https://supabase.com/privacy' target='_blank' rel='noreferrer noopener'>Supabase Privacy Policy</a>.
          </li>
          <li>
            <strong>Vercel</strong> — website hosting.{' '}
            <a href='https://vercel.com/legal/privacy-policy' target='_blank' rel='noreferrer noopener'>Vercel Privacy Policy</a>.
          </li>
          <li>
            <strong>Anthropic</strong> — AI service provider (for the chatbot,
            AI insights, and per-trade AI review features). Anthropic operates
            under a no-train agreement, meaning your data is not used to train
            their models. <a href='https://www.anthropic.com/legal/privacy' target='_blank' rel='noreferrer noopener'>Anthropic Privacy Policy</a>.
          </li>
          <li>
            <strong>Sentry</strong> — error monitoring and performance
            tracking. <a href='https://sentry.io/privacy/' target='_blank' rel='noreferrer noopener'>Sentry Privacy Policy</a>.
          </li>
          <li>
            <strong>Google</strong> — Sign in with Google for authentication.{' '}
            <a href='https://policies.google.com/privacy' target='_blank' rel='noreferrer noopener'>Google Privacy Policy</a>.
          </li>
          <li>
            <strong>Apple</strong> — Sign in with Apple for authentication.{' '}
            <a href='https://www.apple.com/legal/privacy/' target='_blank' rel='noreferrer noopener'>Apple Privacy Policy</a>.
          </li>
          <li>
            <strong>Flutterwave</strong> — payment processing for credit and
            debit cards.{' '}
            <a href='https://flutterwave.com/us/privacy-notice' target='_blank' rel='noreferrer noopener'>Flutterwave Privacy Notice</a>.
          </li>
          <li>
            <strong>NOWPayments</strong> — cryptocurrency payment processing.{' '}
            <a href='https://nowpayments.io/doc/fd-privacy-policy.pdf' target='_blank' rel='noreferrer noopener'>NOWPayments Privacy Policy</a>.
          </li>
          <li>
            <strong>Tawk.to</strong> — live chat support, loaded only when you
            start a chat with us. The messages you send and basic visitor data
            are processed by Tawk.to (US-based).{' '}
            <a href='https://www.tawk.to/privacy-policy/' target='_blank' rel='noreferrer noopener'>Tawk.to Privacy Policy</a>.
          </li>
        </ul>
        <p>
          <strong>Business Transfers.</strong> We may share or transfer your
          information in connection with, or during negotiations of, any
          merger, sale of company assets, financing, or acquisition of all
          or a portion of our business to another company.
        </p>

        <h2>5. Do we use cookies and other tracking technologies?</h2>
        <p>
          We use a single first-party authentication cookie (managed by
          Supabase) to keep you signed in. We do <strong>not</strong> use
          analytics cookies, advertising cookies, tracking pixels, web
          beacons, or any third-party tracking. We do not serve targeted
          advertising, and we do not permit third parties to use tracking
          technologies on our Services.
        </p>
        <p>
          Full details about our cookie use are set out in our{' '}
          <a href='/cookies'>Cookie Policy</a>.
        </p>

        <h2>6. Do we offer artificial intelligence-based products?</h2>
        <p>
          As part of our Services, we offer products, features, or tools
          powered by artificial intelligence and machine learning
          (collectively, &ldquo;<strong>AI Products</strong>&rdquo;). These
          are designed to enhance your experience and provide you with
          insights about your own trading. The terms in this Privacy Notice
          govern your use of the AI Products within our Services.
        </p>
        <h3>Use of AI Technologies</h3>
        <p>
          We provide AI Products through third-party service providers
          (&ldquo;<strong>AI Service Providers</strong>&rdquo;), specifically{' '}
          <strong>Anthropic</strong>. When you use AI features, your input
          and the relevant trade data needed to generate output will be
          shared with and processed by Anthropic to enable the requested
          functionality.
        </p>
        <p>
          Anthropic operates under a contractual agreement that prohibits
          the use of your data to train their models. You must not use the
          AI Products in any way that violates the terms or policies of any
          AI Service Provider.
        </p>
        <h3>Our AI Products</h3>
        <p>Our AI Products are designed for the following functions:</p>
        <ul>
          <li>AI bots (help chatbot)</li>
          <li>AI insights (pattern analysis across your trade history)</li>
          <li>Text analysis (per-trade AI review of your notes)</li>
          <li>Natural language processing</li>
        </ul>
        <h3>How we process your data using AI</h3>
        <p>
          All personal information processed using our AI Products is handled
          in line with this Privacy Notice and our agreement with Anthropic.
          <strong> AI features are opt-in</strong> — they are disabled by
          default and only activated when you enable them in your account
          settings.
        </p>
        <h3>How to opt out</h3>
        <p>To opt out of AI processing, you can:</p>
        <ul>
          <li>Log in to your account settings and disable AI features.</li>
          <li>
            Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> using the
            contact information provided.
          </li>
        </ul>

        <h2>7. How do we handle your social logins?</h2>
        <p>
          Our Services offer you the ability to register and log in using
          your <strong>Google</strong> or <strong>Apple</strong> account.
          Where you choose to do this, we will receive certain profile
          information about you from your social media provider. The profile
          information we receive typically includes your name and email
          address (and, for Apple Sign In, optionally a relay email if you
          choose to hide your real email).
        </p>
        <p>
          We will use the information we receive only for the purposes
          described in this Privacy Notice or otherwise made clear to you on
          the Services. Please note that we do not control, and are not
          responsible for, other uses of your personal information by your
          third-party social media provider. We recommend that you review
          their privacy notice to understand how they collect, use, and
          share your personal information, and how you can set your privacy
          preferences on their platforms.
        </p>

        <h2>8. Is your information transferred internationally?</h2>
        <p>
          Our servers are split across multiple regions: our website hosting
          (Vercel) runs in the United States, while our database, file storage,
          and authentication (Supabase) run in Australia (Sydney). Regardless
          of your location, please be aware that your information may be
          transferred to, stored by, and processed by us in our facilities
          and in the facilities of the third parties with whom we share your
          personal information, including facilities in the United States,
          Australia, Estonia, Nigeria, and other countries.
        </p>
        <p>
          If you are a resident in the European Economic Area (EEA), United
          Kingdom (UK), or Switzerland, then these countries may not
          necessarily have data protection laws or other similar laws as
          comprehensive as those in your country. However, we will take all
          necessary measures to protect your personal information in
          accordance with this Privacy Notice and applicable law.
        </p>
        <h3>European Commission&apos;s Standard Contractual Clauses</h3>
        <p>
          We have implemented measures to protect your personal information,
          including by using the European Commission&apos;s Standard
          Contractual Clauses for transfers of personal information between
          us and our third-party providers. These clauses require all
          recipients to protect all personal information that they process
          originating from the EEA or UK in accordance with European data
          protection laws and regulations. Our Standard Contractual Clauses
          can be provided upon request.
        </p>

        <h2>9. How long do we keep your information?</h2>
        <p>
          We will only keep your personal information for as long as it is
          necessary for the purposes set out in this Privacy Notice, unless
          a longer retention period is required or permitted by law (such as
          tax, accounting, or other legal requirements). No purpose in this
          notice will require us keeping your personal information for
          longer than the period of time in which users have an account
          with us.
        </p>
        <p>
          When you delete your account, we will delete or anonymise your
          personal information within 30 days, except where a longer
          retention is legally required.
        </p>

        <h2>10. How do we keep your information safe?</h2>
        <p>
          We have implemented appropriate and reasonable technical and
          organisational security measures designed to protect the security
          of any personal information we process. Specifically:
        </p>
        <ul>
          <li>
            Your data is stored in Supabase (PostgreSQL), encrypted at rest
            and in transit.
          </li>
          <li>
            Access is protected by Row-Level Security policies — only you
            can read your own trades and screenshots.
          </li>
          <li>
            Screenshots are stored in private object storage and served via
            time-limited signed URLs that expire after a short window.
          </li>
          <li>
            Error monitoring (Sentry) and request logging help us detect and
            respond to incidents quickly.
          </li>
        </ul>
        <p>
          However, despite our safeguards, no electronic transmission over
          the Internet or information storage technology can be guaranteed
          to be 100% secure, so we cannot promise or guarantee that hackers,
          cybercriminals, or other unauthorised third parties will not be
          able to defeat our security and improperly collect, access, steal,
          or modify your information. You should only access the Services
          within a secure environment.
        </p>

        <h2>11. Do we collect information from minors?</h2>
        <p>
          We do not knowingly collect data from or market to children under
          18 years of age or the equivalent age as specified by law in your
          jurisdiction. By using the Services, you represent that you are
          at least 18 or the equivalent age as specified by law in your
          jurisdiction. If we learn that personal information from users
          less than 18 years of age has been collected, we will deactivate
          the account and take reasonable measures to promptly delete such
          data from our records. If you become aware of any data we may
          have collected from children under 18, please contact us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>12. What are your privacy rights?</h2>
        <p>
          Depending on your state of residence in the US or in some regions,
          such as the European Economic Area (EEA), United Kingdom (UK),
          Switzerland, and Canada, you have rights that allow you greater
          access to and control over your personal information. You may
          review, change, or terminate your account at any time.
        </p>
        <p>
          In some regions (like the EEA, UK, Switzerland, and Canada), you
          have certain rights under applicable data protection laws. These
          may include the right (i) to request access and obtain a copy of
          your personal information, (ii) to request rectification or
          erasure; (iii) to restrict the processing of your personal
          information; (iv) if applicable, to data portability; and (v) not
          to be subject to automated decision-making.
        </p>
        <p>
          If you are located in the EEA or UK and you believe we are
          unlawfully processing your personal information, you also have the
          right to complain to your Member State data protection authority
          or UK data protection authority.
        </p>
        <p>
          If you are located in Switzerland, you may contact the Federal
          Data Protection and Information Commissioner.
        </p>
        <h3>Withdrawing your consent</h3>
        <p>
          If we are relying on your consent to process your personal
          information, you have the right to withdraw your consent at any
          time. You can withdraw your consent at any time by contacting us
          or by updating your preferences in your account settings.
        </p>
        <h3>Account Information</h3>
        <p>
          If you would at any time like to review or change the information
          in your account or terminate your account, you can:
        </p>
        <ul>
          <li>Log in to your account settings and update your user account.</li>
          <li>
            Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </li>
        </ul>
        <p>
          Upon your request to terminate your account, we will deactivate or
          delete your account and information from our active databases
          within 30 days. We may retain some information in our files to
          prevent fraud, troubleshoot problems, assist with any
          investigations, enforce our legal terms, and/or comply with
          applicable legal requirements.
        </p>

        <h2>13. Controls for do-not-track features</h2>
        <p>
          Most web browsers and some mobile operating systems and mobile
          applications include a Do-Not-Track (&ldquo;DNT&rdquo;) feature or
          setting you can activate to signal your privacy preference not to
          have data about your online browsing activities monitored and
          collected. At this stage, no uniform technology standard for
          recognising and implementing DNT signals has been finalised. As
          such, we do not currently respond to DNT browser signals or any
          other mechanism that automatically communicates your choice not to
          be tracked online — primarily because we don&apos;t engage in the
          kind of cross-site behavioural tracking that DNT is designed to
          block.
        </p>

        <h2>14. Do United States residents have specific privacy rights?</h2>
        <p>
          <strong>In Short:</strong> If you are a resident of California,
          Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky,
          Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey,
          Oregon, Rhode Island, Tennessee, Texas, Utah, or Virginia, you may
          have the right to request access to and receive details about the
          personal information we maintain about you and how we have
          processed it, correct inaccuracies, get a copy of, or delete your
          personal information. You may also have the right to withdraw your
          consent to our processing of your personal information.
        </p>
        <h3>Categories of personal information we collect</h3>
        <p>
          The table below shows the categories of personal information we
          have collected in the past twelve (12) months.
        </p>
        <ul>
          <li>
            <strong>A. Identifiers</strong> (name, email, IP address,
            account name) — <strong>Yes</strong>
          </li>
          <li>
            <strong>B. Personal information under California Customer
            Records statute</strong> (name, contact info) — <strong>Yes</strong>
          </li>
          <li>
            <strong>C. Protected classification characteristics</strong>{' '}
            (gender, age, race, etc.) — <strong>No</strong>
          </li>
          <li>
            <strong>D. Commercial information</strong> (transaction info,
            purchase history) — <strong>Yes</strong>
          </li>
          <li>
            <strong>E. Biometric information</strong> — <strong>No</strong>
          </li>
          <li>
            <strong>F. Internet or other similar network activity</strong>{' '}
            (browsing/usage data within our Service) — <strong>Yes</strong>
          </li>
          <li>
            <strong>G. Geolocation data</strong> — <strong>No</strong>
          </li>
          <li>
            <strong>H. Audio/electronic/sensory information</strong> —{' '}
            <strong>No</strong>
          </li>
          <li>
            <strong>I. Professional or employment-related information</strong>{' '}
            — <strong>No</strong>
          </li>
          <li>
            <strong>J. Education information</strong> — <strong>No</strong>
          </li>
          <li>
            <strong>K. Inferences drawn from collected personal information
            </strong> — <strong>No</strong>
          </li>
          <li>
            <strong>L. Sensitive personal information</strong> —{' '}
            <strong>No</strong>
          </li>
        </ul>
        <p>
          We will use and retain the collected personal information as
          needed to provide the Services for as long as the user has an
          account with us (categories A, B, D, F).
        </p>
        <h3>Will your information be shared with anyone else?</h3>
        <p>
          We may disclose your personal information with our service
          providers pursuant to a written contract between us and each
          service provider. We may use your personal information for our
          own business purposes, such as for undertaking internal research
          for technological development and demonstration. This is not
          considered to be &ldquo;selling&rdquo; of your personal
          information.
        </p>
        <p>
          <strong>We have not sold or shared any personal information</strong>{' '}
          to third parties for a business or commercial purpose in the
          preceding twelve (12) months. We have disclosed categories A, B,
          D, and F of personal information to our service providers for
          business or commercial purposes only (operating the Service).
        </p>
        <h3>Your rights</h3>
        <p>
          You have rights under certain US state data protection laws. These
          rights include:
        </p>
        <ul>
          <li>Right to know whether we are processing your personal data</li>
          <li>Right to access your personal data</li>
          <li>Right to correct inaccuracies in your personal data</li>
          <li>Right to request the deletion of your personal data</li>
          <li>Right to obtain a copy of the personal data you previously shared with us</li>
          <li>Right to non-discrimination for exercising your rights</li>
          <li>
            Right to opt out of the processing of your personal data if it
            is used for targeted advertising, the sale of personal data, or
            profiling (we don&apos;t do any of these — opt-out is
            automatic)
          </li>
        </ul>
        <h3>How to exercise your rights</h3>
        <p>
          To exercise these rights, you can contact us by visiting{' '}
          <a href='/contact'>https://tradershindsight.com/contact</a>, by
          emailing us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or by
          referring to the contact details at the bottom of this document.
        </p>
        <h3>Request verification</h3>
        <p>
          Upon receiving your request, we will need to verify your identity
          to determine you are the same person about whom we have the
          information in our system. We will only use personal information
          provided in your request to verify your identity or authority to
          make the request.
        </p>
        <h3>Appeals</h3>
        <p>
          Under certain US state data protection laws, if we decline to
          take action regarding your request, you may appeal our decision
          by emailing us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <h3>California &ldquo;Shine The Light&rdquo; Law</h3>
        <p>
          California Civil Code Section 1798.83, also known as the &ldquo;
          Shine The Light&rdquo; law, permits our users who are California
          residents to request and obtain from us, once a year and free of
          charge, information about categories of personal information (if
          any) we disclosed to third parties for direct marketing purposes.
          We do not disclose personal information to third parties for
          their direct marketing purposes.
        </p>

        <h2>15. Do other regions have specific privacy rights?</h2>
        <h3>Australia and New Zealand</h3>
        <p>
          We collect and process your personal information under the
          obligations and conditions set by Australia&apos;s Privacy Act
          1988 and New Zealand&apos;s Privacy Act 2020. At any time, you
          have the right to request access to or correction of your
          personal information by contacting us.
        </p>
        <p>
          If you believe we are unlawfully processing your personal
          information, you have the right to submit a complaint about a
          breach of the Australian Privacy Principles to the Office of the
          Australian Information Commissioner, and a breach of New
          Zealand&apos;s Privacy Principles to the Office of New Zealand
          Privacy Commissioner.
        </p>
        <h3>Republic of South Africa</h3>
        <p>
          At any time, you have the right to request access to or
          correction of your personal information by contacting us. If you
          are unsatisfied with the manner in which we address any
          complaint, you can contact the office of the regulator (the
          Information Regulator of South Africa) at{' '}
          <a href='mailto:enquiries@inforegulator.org.za'>
            enquiries@inforegulator.org.za
          </a>{' '}
          (general enquiries) or via the POPIA/PAIA Form 5 process.
        </p>

        <h2>16. Do we make updates to this notice?</h2>
        <p>
          We may update this Privacy Notice from time to time. The updated
          version will be indicated by an updated &ldquo;Effective&rdquo;
          date at the top of this Privacy Notice. If we make material
          changes to this Privacy Notice, we may notify you either by
          prominently posting a notice of such changes or by directly
          sending you a notification.
        </p>

        <h2>17. How can you contact us about this notice?</h2>
        <p>
          If you have questions or comments about this notice, you may email
          us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> or contact
          us by post at:
        </p>
        <p>
          The Trader&apos;s Hindsight
          <br />
          Dumlupinar Mah. Yavuz Sok.
          <br />
          Kadıköy, Istanbul 34720
          <br />
          Turkey
          <br />
          Phone: +90 501 326 2900
        </p>

        <h2>18. How can you review, update, or delete the data we collect from you?</h2>
        <p>
          You have the right to request access to the personal information
          we collect from you, details about how we have processed it,
          correct inaccuracies, or delete your personal information. You may
          also have the right to withdraw your consent to our processing of
          your personal information. These rights may be limited in some
          circumstances by applicable law. To request to review, update, or
          delete your personal information, please visit:{' '}
          <a href='/contact'>https://tradershindsight.com/contact</a>.
        </p>
      </LegalContainer>
    </MarketingShell>
  );
}
