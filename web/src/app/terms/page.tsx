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

const EFFECTIVE_DATE = 'May 20, 2026';
const CONTACT_EMAIL = 'support@tradershindsight.com';

export default function TermsPage() {
  return (
    <MarketingShell>
      <LegalContainer title='Terms of Service' effectiveDate={EFFECTIVE_DATE}>
        <h2>Agreement to Our Legal Terms</h2>
        <p>
          We are The Trader&apos;s Hindsight (&ldquo;<strong>Company</strong>
          &rdquo;, &ldquo;<strong>we</strong>&rdquo;, &ldquo;
          <strong>us</strong>&rdquo;, or &ldquo;<strong>our</strong>&rdquo;), a
          business operating from Nigeria at Agbor, Delta State, Nigeria.
        </p>
        <p>
          We operate the website{' '}
          <a href='https://tradershindsight.com'>
            https://tradershindsight.com
          </a>{' '}
          (the &ldquo;<strong>Site</strong>&rdquo;), as well as any other
          related products and services that refer or link to these legal
          terms (the &ldquo;<strong>Legal Terms</strong>&rdquo;) (collectively,
          the &ldquo;<strong>Services</strong>&rdquo;).
        </p>
        <p>
          The Trader&apos;s Hindsight is a trading journal and analytics
          platform for individual retail traders. Users sign up with an email
          address and optionally set a display name. They create one or more
          trading accounts (with name, type, starting balance, and base
          currency) and log their trades — including entry/exit prices, P&amp;L,
          risk amounts, trade setups, screenshots, and personal review notes.
          The platform provides per-trade review checklists, multi-account
          support, copy-trade grouping across accounts, and aggregate
          performance analytics (win rate, profit factor, drawdown, etc.).
        </p>
        <p>
          You can contact us by phone at +234 811 869 8266, email at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or by mail
          to Agbor, Delta State, Nigeria.
        </p>
        <p>
          These Legal Terms constitute a legally binding agreement made between
          you, whether personally or on behalf of an entity (&ldquo;
          <strong>you</strong>&rdquo;), and The Trader&apos;s Hindsight,
          concerning your access to and use of the Services. You agree that by
          accessing the Services, you have read, understood, and agreed to be
          bound by all of these Legal Terms. <strong>If you do not agree with
          all of these Legal Terms, then you are expressly prohibited from
          using the Services and you must discontinue use immediately.</strong>
        </p>

        {/* ─── Critical disclaimer for a trading product. Loud, early. ─── */}
        <div className='mt-8 rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm leading-relaxed text-amber-100'>
          <strong className='block font-semibold text-amber-200'>
            Important — this is not financial advice.
          </strong>
          <p className='mt-2'>
            The Trader&apos;s Hindsight is a journal and analytics tool.
            Nothing in the Services is investment, financial, legal, tax, or
            trading advice, and nothing in the Services is a recommendation
            to buy, sell, or hold any instrument. You are solely responsible
            for your trading decisions and outcomes. Trading carries
            substantial risk of loss; past performance is not indicative of
            future results.
          </p>
        </div>

        <p>
          We will provide you with prior notice of any scheduled changes to
          the Services you are using. Changes to these Legal Terms will become
          effective thirty (30) days after the notice is given, except if the
          changes apply to new functionality, security updates, bug fixes, and
          a court order, in which case the changes will be effective
          immediately. By continuing to use the Services after the effective
          date of any changes, you agree to be bound by the modified terms. If
          you disagree with such changes, you may terminate Services as per
          the section &ldquo;Term and Termination&rdquo;.
        </p>
        <p>
          The Services are intended for users who are at least 18 years old.
          Persons under the age of 18 are not permitted to use or register for
          the Services.
        </p>
        <p>We recommend that you print a copy of these Legal Terms for your records.</p>

        <h2>1. Our Services</h2>
        <p>
          The information provided when using the Services is not intended for
          distribution to or use by any person or entity in any jurisdiction
          or country where such distribution or use would be contrary to law
          or regulation or which would subject us to any registration
          requirement within such jurisdiction or country. Accordingly, those
          persons who choose to access the Services from other locations do so
          on their own initiative and are solely responsible for compliance
          with local laws, if and to the extent local laws are applicable.
        </p>
        <p>
          The Services are not tailored to comply with industry-specific
          regulations (Health Insurance Portability and Accountability Act
          (HIPAA), Federal Information Security Management Act (FISMA), etc.),
          so if your interactions would be subjected to such laws, you may not
          use the Services. You may not use the Services in a way that would
          violate the Gramm-Leach-Bliley Act (GLBA).
        </p>

        <h2>2. Intellectual Property Rights</h2>
        <h3>Our intellectual property</h3>
        <p>
          We are the owner or the licensee of all intellectual property rights
          in our Services, including all source code, databases, functionality,
          software, website designs, audio, video, text, photographs, and
          graphics in the Services (collectively, the &ldquo;<strong>Content
          </strong>&rdquo;), as well as the trademarks, service marks, and
          logos contained therein (the &ldquo;<strong>Marks</strong>&rdquo;).
        </p>
        <p>
          Our Content and Marks are protected by copyright and trademark laws
          (and various other intellectual property rights and unfair
          competition laws) and treaties around the world.
        </p>
        <p>
          The Content and Marks are provided in or through the Services
          &ldquo;<strong>AS IS</strong>&rdquo; for your personal,
          non-commercial use only.
        </p>

        <h3>Your use of our Services</h3>
        <p>
          Subject to your compliance with these Legal Terms, including the
          &ldquo;Prohibited Activities&rdquo; section below, we grant you a
          non-exclusive, non-transferable, revocable licence to:
        </p>
        <ul>
          <li>access the Services; and</li>
          <li>
            download or print a copy of any portion of the Content to which
            you have properly gained access,
          </li>
        </ul>
        <p>solely for your personal, non-commercial use.</p>
        <p>
          Except as set out in this section or elsewhere in our Legal Terms,
          no part of the Services and no Content or Marks may be copied,
          reproduced, aggregated, republished, uploaded, posted, publicly
          displayed, encoded, translated, transmitted, distributed, sold,
          licensed, or otherwise exploited for any commercial purpose
          whatsoever, without our express prior written permission.
        </p>
        <p>
          If you wish to make any use of the Services, Content, or Marks other
          than as set out in this section or elsewhere in our Legal Terms,
          please address your request to:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If we ever
          grant you the permission to post, reproduce, or publicly display any
          part of our Services or Content, you must identify us as the owners
          or licensors of the Services, Content, or Marks and ensure that any
          copyright or proprietary notice appears or is visible on posting,
          reproducing, or displaying our Content.
        </p>
        <p>
          We reserve all rights not expressly granted to you in and to the
          Services, Content, and Marks. Any breach of these Intellectual
          Property Rights will constitute a material breach of our Legal Terms
          and your right to use our Services will terminate immediately.
        </p>

        <h3>Your submissions and contributions</h3>
        <p>
          Please review this section and the &ldquo;Prohibited Activities&rdquo;
          section carefully prior to using our Services to understand the (a)
          rights you give us and (b) obligations you have when you post or
          upload any content through the Services.
        </p>
        <p>
          <strong>Submissions:</strong> By directly sending us any question,
          comment, suggestion, idea, feedback, or other information about the
          Services (&ldquo;<strong>Submissions</strong>&rdquo;), you agree to
          assign to us all intellectual property rights in such Submission.
          You agree that we shall own this Submission and be entitled to its
          unrestricted use and dissemination for any lawful purpose, commercial
          or otherwise, without acknowledgment or compensation to you.
        </p>
        <p>
          <strong>Contributions:</strong> The Services may allow you to create,
          submit, post, display, transmit, publish, distribute, or broadcast
          content and materials to us or through the Services, including but
          not limited to text, writings, video, audio, photographs, music,
          graphics, comments, reviews, suggestions, personal information, or
          other material (&ldquo;<strong>Contributions</strong>&rdquo;). Any
          Submission that is publicly posted shall also be treated as a
          Contribution. You understand that Contributions may be viewable by
          other users of the Services and possibly through third-party websites.
        </p>
        <p>
          <strong>You are responsible for what you post or upload.</strong> By
          sending us Submissions and/or posting Contributions through any part
          of the Services or making Contributions accessible through the
          Services, you: (a) confirm that you have read and agree with our
          &ldquo;Prohibited Activities&rdquo; section and will not post any
          Submission or Contribution that is illegal, harassing, harmful,
          defamatory, obscene, abusive, discriminatory, false, or misleading;
          (b) waive any moral rights to any such Submission or Contribution to
          the extent permissible by applicable law; (c) warrant that your
          Submissions or Contributions are original or that you have the
          necessary rights and licences; and (d) warrant that your Submissions
          or Contributions do not constitute confidential information.
        </p>
        <p>
          You are solely responsible for your Submissions and Contributions
          and you expressly agree to reimburse us for any losses we may suffer
          because of your breach of (a) this section, (b) any third
          party&apos;s intellectual property rights, or (c) applicable law.
        </p>
        <p>
          <strong>We may remove or edit your Content.</strong> Although we
          have no obligation to monitor any Contributions, we shall have the
          right to remove or edit any Contributions at any time without notice
          if in our reasonable opinion we consider such Contributions harmful
          or in breach of these Legal Terms.
        </p>

        <h2>3. User Representations</h2>
        <p>
          By using the Services, you represent and warrant that: (1) all
          registration information you submit will be true, accurate, current,
          and complete; (2) you will maintain the accuracy of such information
          and promptly update it as necessary; (3) you have the legal capacity
          and you agree to comply with these Legal Terms; (4) you are not a
          minor in the jurisdiction in which you reside; (5) you will not
          access the Services through automated or non-human means, whether
          through a bot, script, or otherwise; (6) you will not use the
          Services for any illegal or unauthorised purpose; and (7) your use
          of the Services will not violate any applicable law or regulation.
        </p>
        <p>
          If you provide any information that is untrue, inaccurate, not
          current, or incomplete, we have the right to suspend or terminate
          your account and refuse any and all current or future use of the
          Services (or any portion thereof).
        </p>

        <h2>4. User Registration</h2>
        <p>
          You may be required to register to use the Services. You agree to
          keep your password confidential and will be responsible for all use
          of your account and password. We reserve the right to remove,
          reclaim, or change a username you select if we determine, in our
          sole discretion, that such username is inappropriate, obscene, or
          otherwise objectionable.
        </p>

        <h2>5. Purchases and Payment</h2>
        <p>We accept the following forms of payment:</p>
        <ul>
          <li>Visa</li>
          <li>Mastercard</li>
          <li>American Express</li>
          <li>Discover</li>
          <li>Apple Pay</li>
          <li>Google Pay</li>
          <li>Cryptocurrency (BTC, ETH, USDC, USDT)</li>
        </ul>
        <p>
          You agree to provide current, complete, and accurate purchase and
          account information for all purchases made via the Services. You
          further agree to promptly update account and payment information,
          including email address, payment method, and payment card expiration
          date, so that we can complete your transactions and contact you as
          needed. Sales tax will be added to the price of purchases as deemed
          required by us. We may change prices at any time. All payments shall
          be in US dollars.
        </p>
        <p>
          You agree to pay all charges at the prices then in effect for your
          purchases, and you authorise us to charge your chosen payment
          provider for any such amounts upon placing your order. We reserve
          the right to correct any errors or mistakes in pricing, even if we
          have already requested or received payment.
        </p>
        <p>
          We reserve the right to refuse any order placed through the
          Services. We may, in our sole discretion, limit or cancel quantities
          purchased per person, per household, or per order. We reserve the
          right to limit or prohibit orders that, in our sole judgement,
          appear to be placed by dealers, resellers, or distributors.
        </p>

        <h2>6. Subscriptions</h2>
        <h3>Billing and Renewal</h3>
        <p>
          Your subscription will continue and automatically renew unless
          cancelled. You consent to our charging your payment method on a
          recurring basis without requiring your prior approval for each
          recurring charge, until such time as you cancel the applicable
          order. The length of your billing cycle will depend on the type of
          subscription plan you choose when you subscribed to the Services.
        </p>
        <h3>Cancellation</h3>
        <p>
          You can cancel your subscription at any time by logging into your
          account. Your cancellation will take effect at the end of the current
          paid term, and you keep access until then. Fees already paid for the
          current term are generally non-refundable, except in the specific
          cases set out in our{' '}
          <a href='/refunds'>Refund &amp; Cancellation Policy</a>, which governs
          all refunds and cancellations. If you have any questions or are
          unsatisfied with our Services, please email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <h3>Fee Changes</h3>
        <p>
          We may, from time to time, make changes to the subscription fee and
          will communicate any price changes to you in accordance with
          applicable law.
        </p>

        <h2>7. Prohibited Activities</h2>
        <p>
          You may not access or use the Services for any purpose other than
          that for which we make the Services available. The Services may not
          be used in connection with any commercial endeavours except those
          that are specifically endorsed or approved by us.
        </p>
        <p>As a user of the Services, you agree not to:</p>
        <ul>
          <li>
            Systematically retrieve data or other content from the Services to
            create or compile, directly or indirectly, a collection,
            compilation, database, or directory without written permission
            from us.
          </li>
          <li>
            Trick, defraud, or mislead us and other users, especially in any
            attempt to learn sensitive account information such as user
            passwords.
          </li>
          <li>
            Circumvent, disable, or otherwise interfere with security-related
            features of the Services.
          </li>
          <li>
            Disparage, tarnish, or otherwise harm, in our opinion, us and/or
            the Services.
          </li>
          <li>
            Use any information obtained from the Services in order to harass,
            abuse, or harm another person.
          </li>
          <li>
            Make improper use of our support services or submit false reports
            of abuse or misconduct.
          </li>
          <li>
            Use the Services in a manner inconsistent with any applicable laws
            or regulations.
          </li>
          <li>
            Engage in unauthorised framing of or linking to the Services.
          </li>
          <li>
            Upload or transmit viruses, Trojan horses, or other material that
            interferes with any party&apos;s uninterrupted use and enjoyment
            of the Services.
          </li>
          <li>
            Engage in any automated use of the system, such as using scripts
            to send comments or messages, or using any data mining, robots, or
            similar data gathering and extraction tools.
          </li>
          <li>
            Delete the copyright or other proprietary rights notice from any
            Content.
          </li>
          <li>
            Attempt to impersonate another user or person or use the username
            of another user.
          </li>
          <li>
            Interfere with, disrupt, or create an undue burden on the Services
            or the networks or services connected to the Services.
          </li>
          <li>
            Harass, annoy, intimidate, or threaten any of our employees or
            agents engaged in providing any portion of the Services to you.
          </li>
          <li>
            Attempt to bypass any measures of the Services designed to prevent
            or restrict access to the Services.
          </li>
          <li>
            Except as permitted by applicable law, decipher, decompile,
            disassemble, or reverse engineer any of the software comprising or
            in any way making up a part of the Services.
          </li>
          <li>
            Use, launch, develop, or distribute any automated system,
            including any spider, robot, scraper, or offline reader that
            accesses the Services.
          </li>
          <li>
            Use the Services as part of any effort to compete with us or
            otherwise use the Services and/or the Content for any
            revenue-generating endeavour or commercial enterprise.
          </li>
          <li>Use the Services to advertise or offer to sell goods and services.</li>
          <li>Sell or otherwise transfer your profile.</li>
          <li>
            Use the Services in connection with market manipulation, insider
            trading, money laundering, or other financial crimes.
          </li>
        </ul>

        <h2>8. User Generated Contributions</h2>
        <p>
          The Services may invite you to chat, contribute to, or participate
          in functionality that lets you create, submit, post, display,
          transmit, perform, publish, distribute, or broadcast content and
          materials. When you create or make available any Contributions, you
          represent and warrant that:
        </p>
        <ul>
          <li>
            Your Contributions do not infringe the proprietary rights of any
            third party.
          </li>
          <li>
            You are the creator and owner of, or have the necessary licences,
            rights, consents, releases, and permissions to use and authorise
            us to use your Contributions.
          </li>
          <li>Your Contributions are not false, inaccurate, or misleading.</li>
          <li>
            Your Contributions are not unsolicited or unauthorised advertising,
            promotional materials, pyramid schemes, chain letters, spam, or
            other forms of solicitation.
          </li>
          <li>
            Your Contributions are not obscene, lewd, lascivious, filthy,
            violent, harassing, libellous, slanderous, or otherwise
            objectionable.
          </li>
          <li>
            Your Contributions do not ridicule, mock, disparage, intimidate,
            or abuse anyone.
          </li>
          <li>
            Your Contributions do not violate any applicable law, regulation,
            or rule.
          </li>
          <li>
            Your Contributions do not violate the privacy or publicity rights
            of any third party.
          </li>
          <li>
            Your Contributions do not include offensive comments connected to
            race, national origin, gender, sexual preference, or physical
            handicap.
          </li>
          <li>
            Your Contributions do not violate any provision of these Legal
            Terms, or any applicable law or regulation.
          </li>
        </ul>
        <p>
          Any use of the Services in violation of the foregoing violates these
          Legal Terms and may result in, among other things, termination or
          suspension of your rights to use the Services.
        </p>

        <h2>9. Contribution Licence</h2>
        <p>
          By posting your Contributions to any part of the Services, you grant
          us a non-exclusive, transferable, royalty-free, fully-paid, worldwide
          licence to host, use, copy, reproduce, store, and display your
          Contributions <strong>solely to provide the Services to you</strong>.
          We do not assert any ownership over your Contributions, will not use
          your Contributions for marketing or training purposes, and will not
          sell or share your Contributions with third parties beyond what is
          required to operate the Services. You retain full ownership of all
          of your Contributions and any intellectual property rights or other
          proprietary rights associated with your Contributions.
        </p>
        <p>
          We have the right, in our sole discretion, to (1) edit, redact, or
          otherwise change any Contributions that violate these Legal Terms or
          applicable law; and (2) delete any Contributions at any time and for
          any reason, without notice. We have no obligation to monitor your
          Contributions.
        </p>

        <h2>10. Third-Party Websites and Content</h2>
        <p>
          The Services may contain (or you may be sent via the Site) links to
          other websites (&ldquo;<strong>Third-Party Websites</strong>&rdquo;)
          as well as articles, photographs, text, graphics, pictures, designs,
          music, sound, video, information, applications, software, and other
          content or items belonging to or originating from third parties
          (&ldquo;<strong>Third-Party Content</strong>&rdquo;). Such
          Third-Party Websites and Third-Party Content are not investigated,
          monitored, or checked for accuracy, appropriateness, or completeness
          by us, and we are not responsible for any Third-Party Websites
          accessed through the Services or any Third-Party Content posted on,
          available through, or installed from the Services.
        </p>
        <p>
          If you decide to leave the Services and access Third-Party Websites
          or to use or install any Third-Party Content, you do so at your own
          risk, and you should be aware these Legal Terms no longer govern.
          You should review the applicable terms and policies, including
          privacy and data gathering practices, of any website to which you
          navigate from the Services.
        </p>

        <h2>11. Services Management</h2>
        <p>
          We reserve the right, but not the obligation, to: (1) monitor the
          Services for violations of these Legal Terms; (2) take appropriate
          legal action against anyone who, in our sole discretion, violates
          the law or these Legal Terms, including reporting such user to law
          enforcement authorities; (3) in our sole discretion and without
          limitation, refuse, restrict access to, limit the availability of,
          or disable any of your Contributions or any portion thereof; (4) in
          our sole discretion and without limitation, remove from the Services
          or otherwise disable all files and content that are excessive in
          size or are in any way burdensome to our systems; and (5) otherwise
          manage the Services in a manner designed to protect our rights and
          property and to facilitate the proper functioning of the Services.
        </p>

        <h2>12. Privacy Policy</h2>
        <p>
          We care about data privacy and security. Please review our{' '}
          <a href='/privacy'>Privacy Policy</a>. By using the Services, you
          agree to be bound by our Privacy Policy, which is incorporated into
          these Legal Terms. Please be advised the Services are hosted across
          multiple regions: our website hosting (Vercel) runs in the United
          States, and our database, file storage, and authentication
          (Supabase) run in Australia. If you access the Services from any
          other region of the world with laws or other requirements governing
          personal data collection, use, or disclosure that differ from
          applicable laws in those regions, then through your continued use
          of the Services, you are transferring your data to those regions,
          and you expressly consent to have your data transferred to and
          processed there.
        </p>

        <h2>13. Copyright Infringements</h2>
        <p>
          We respect the intellectual property rights of others. If you
          believe that any material available on or through the Services
          infringes upon any copyright you own or control, please immediately
          notify us using the contact information provided below (a &ldquo;
          <strong>Notification</strong>&rdquo;). A copy of your Notification
          will be sent to the person who posted or stored the material
          addressed in the Notification. Please be advised that pursuant to
          applicable law you may be held liable for damages if you make
          material misrepresentations in a Notification. Thus, if you are not
          sure that material located on or linked to by the Services infringes
          your copyright, you should consider first contacting an attorney.
        </p>

        <h2>14. Term and Termination</h2>
        <p>
          These Legal Terms shall remain in full force and effect while you
          use the Services. <strong>Without limiting any other provision of
          these Legal Terms, we reserve the right to, in our sole discretion
          and without notice or liability, deny access to and use of the
          Services (including blocking certain IP addresses), to any person
          for any reason or for no reason, including for breach of any
          representation, warranty, or covenant contained in these Legal
          Terms or of any applicable law or regulation.</strong> We may
          terminate your use or participation in the Services or delete your
          account and any content or information that you posted at any time,
          without warning, in our sole discretion.
        </p>
        <p>
          If we terminate or suspend your account for any reason, you are
          prohibited from registering and creating a new account under your
          name, a fake or borrowed name, or the name of any third party, even
          if you may be acting on behalf of the third party. In addition to
          terminating or suspending your account, we reserve the right to
          take appropriate legal action, including pursuing civil, criminal,
          and injunctive redress.
        </p>

        <h2>15. Modifications and Interruptions</h2>
        <p>
          We reserve the right to change, modify, or remove the contents of
          the Services at any time or for any reason at our sole discretion
          without notice. However, we have no obligation to update any
          information on our Services. We will not be liable to you or any
          third party for any modification, price change, suspension, or
          discontinuance of the Services.
        </p>
        <p>
          We cannot guarantee the Services will be available at all times. We
          may experience hardware, software, or other problems or need to
          perform maintenance related to the Services, resulting in
          interruptions, delays, or errors. You agree that we have no liability
          whatsoever for any loss, damage, or inconvenience caused by your
          inability to access or use the Services during any downtime or
          discontinuance of the Services.
        </p>

        <h2>16. Governing Law</h2>
        <p>
          These Legal Terms shall be governed by and defined following the
          laws of the Federal Republic of Nigeria. The Trader&apos;s Hindsight
          and yourself irrevocably consent that the courts of Nigeria shall
          have exclusive jurisdiction to resolve any dispute which may arise in
          connection with these Legal Terms.
        </p>

        <h2>17. Dispute Resolution</h2>
        <h3>Informal Negotiations</h3>
        <p>
          To expedite resolution and control the cost of any dispute,
          controversy, or claim related to these Legal Terms (each a &ldquo;
          <strong>Dispute</strong>&rdquo; and collectively, the &ldquo;
          <strong>Disputes</strong>&rdquo;) brought by either you or us
          (individually, a &ldquo;<strong>Party</strong>&rdquo; and
          collectively, the &ldquo;<strong>Parties</strong>&rdquo;), the
          Parties agree to first attempt to negotiate any Dispute informally
          for at least thirty (30) days before initiating arbitration. Such
          informal negotiations commence upon written notice from one Party
          to the other Party.
        </p>
        <h3>Binding Arbitration</h3>
        <p>
          Any dispute arising out of or in connection with these Legal Terms,
          including any question regarding its existence, validity, or
          termination, shall be referred to and finally resolved by binding
          arbitration under the Arbitration and Mediation Act of Nigeria. The
          number of arbitrators shall be one (1). The seat of arbitration shall
          be Lagos, Nigeria. The language of the proceedings shall be English.
          The governing law of these Legal Terms shall be the substantive law
          of Nigeria.
        </p>
        <h3>Restrictions</h3>
        <p>
          The Parties agree that any arbitration shall be limited to the
          Dispute between the Parties individually. To the full extent
          permitted by law, (a) no arbitration shall be joined with any other
          proceeding; (b) there is no right or authority for any Dispute to
          be arbitrated on a class-action basis or to utilise class action
          procedures; and (c) there is no right or authority for any Dispute
          to be brought in a purported representative capacity on behalf of
          the general public or any other persons.
        </p>
        <h3>Exceptions to Informal Negotiations and Arbitration</h3>
        <p>
          The Parties agree that the following Disputes are not subject to
          the above provisions concerning informal negotiations and binding
          arbitration: (a) any Disputes seeking to enforce or protect, or
          concerning the validity of, any of the intellectual property
          rights of a Party; (b) any Dispute related to, or arising from,
          allegations of theft, piracy, invasion of privacy, or unauthorised
          use; and (c) any claim for injunctive relief.
        </p>

        <h2>18. Corrections</h2>
        <p>
          There may be information on the Services that contains typographical
          errors, inaccuracies, or omissions, including descriptions, pricing,
          availability, and various other information. We reserve the right
          to correct any errors, inaccuracies, or omissions and to change or
          update the information on the Services at any time, without prior
          notice.
        </p>

        <h2>19. Disclaimer</h2>
        <p>
          <strong>The Services are provided on an &ldquo;as-is&rdquo; and
          &ldquo;as-available&rdquo; basis. You agree that your use of the
          Services will be at your sole risk.</strong> To the fullest extent
          permitted by law, we disclaim all warranties, express or implied,
          in connection with the Services and your use thereof, including the
          implied warranties of merchantability, fitness for a particular
          purpose, and non-infringement. We make no warranties or
          representations about the accuracy or completeness of the
          Services&apos; content or the content of any websites or mobile
          applications linked to the Services and we will assume no liability
          or responsibility for any (1) errors, mistakes, or inaccuracies of
          content and materials, (2) personal injury or property damage of
          any nature, (3) any unauthorised access to or use of our secure
          servers and/or any personal or financial information stored
          therein, (4) any interruption or cessation of transmission to or
          from the Services, (5) any bugs, viruses, Trojan horses, or the
          like which may be transmitted to or through the Services by any
          third party, and/or (6) any errors or omissions in any content or
          materials.
        </p>

        <h2>20. Limitations of Liability</h2>
        <p>
          <strong>In no event will we or our directors, employees, or agents
          be liable to you or any third party for any direct, indirect,
          consequential, exemplary, incidental, special, or punitive damages,
          including lost profit, lost revenue, loss of data, or other damages
          arising from your use of the Services, even if we have been advised
          of the possibility of such damages.</strong> Notwithstanding
          anything to the contrary contained herein, our liability to you for
          any cause whatsoever and regardless of the form of the action, will
          at all times be limited to the lesser of the amount paid, if any,
          by you to us during the six (6) month period prior to any cause of
          action arising or USD $80.00. Certain US state laws and
          international laws do not allow limitations on implied warranties
          or the exclusion or limitation of certain damages. If these laws
          apply to you, some or all of the above disclaimers or limitations
          may not apply to you, and you may have additional rights.
        </p>

        <h2>21. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold us harmless, including our
          subsidiaries, affiliates, and all of our respective officers,
          agents, partners, and employees, from and against any loss, damage,
          liability, claim, or demand, including reasonable attorneys&apos;
          fees and expenses, made by any third party due to or arising out
          of: (1) your Contributions; (2) use of the Services; (3) breach of
          these Legal Terms; (4) any breach of your representations and
          warranties set forth in these Legal Terms; (5) your violation of
          the rights of a third party, including but not limited to
          intellectual property rights; or (6) any overt harmful act toward
          any other user of the Services with whom you connected via the
          Services.
        </p>

        <h2>22. User Data</h2>
        <p>
          We will maintain certain data that you transmit to the Services for
          the purpose of managing the performance of the Services, as well as
          data relating to your use of the Services. Although we perform
          regular routine backups of data, you are solely responsible for all
          data that you transmit or that relates to any activity you have
          undertaken using the Services. You agree that we shall have no
          liability to you for any loss or corruption of any such data, and
          you hereby waive any right of action against us arising from any
          such loss or corruption of such data.
        </p>

        <h2>23. Electronic Communications, Transactions, and Signatures</h2>
        <p>
          Visiting the Services, sending us emails, and completing online
          forms constitute electronic communications. You consent to receive
          electronic communications, and you agree that all agreements,
          notices, disclosures, and other communications we provide to you
          electronically, via email and on the Services, satisfy any legal
          requirement that such communication be in writing. <strong>You
          hereby agree to the use of electronic signatures, contracts,
          orders, and other records, and to electronic delivery of notices,
          policies, and records of transactions initiated or completed by us
          or via the Services.</strong>
        </p>

        <h2>24. California Users and Residents</h2>
        <p>
          If any complaint with us is not satisfactorily resolved, you can
          contact the Complaint Assistance Unit of the Division of Consumer
          Services of the California Department of Consumer Affairs in
          writing at 1625 North Market Blvd., Suite N 112, Sacramento,
          California 95834 or by telephone at (800) 952-5210 or (916)
          445-1254.
        </p>

        <h2>25. Miscellaneous</h2>
        <p>
          These Legal Terms and any policies or operating rules posted by us
          on the Services or in respect to the Services constitute the entire
          agreement and understanding between you and us. Our failure to
          exercise or enforce any right or provision of these Legal Terms
          shall not operate as a waiver of such right or provision. These
          Legal Terms operate to the fullest extent permissible by law. We
          may assign any or all of our rights and obligations to others at
          any time. We shall not be responsible or liable for any loss,
          damage, delay, or failure to act caused by any cause beyond our
          reasonable control. If any provision or part of a provision of
          these Legal Terms is determined to be unlawful, void, or
          unenforceable, that provision or part of the provision is deemed
          severable from these Legal Terms and does not affect the validity
          and enforceability of any remaining provisions. There is no joint
          venture, partnership, employment, or agency relationship created
          between you and us as a result of these Legal Terms or use of the
          Services.
        </p>

        <h2>26. Contact Us</h2>
        <p>
          In order to resolve a complaint regarding the Services or to receive
          further information regarding use of the Services, please contact us
          at:
        </p>
        <p>
          The Trader&apos;s Hindsight
          <br />
          Agbor
          <br />
          Delta State
          <br />
          Nigeria
          <br />
          Phone: +234 811 869 8266
          <br />
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </LegalContainer>
    </MarketingShell>
  );
}
