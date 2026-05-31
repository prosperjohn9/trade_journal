# Processor Data Processing Agreements (DPAs)

Reference for the GDPR Article 28 DPA coverage we have with each third-party
processor named in our [Privacy Policy](../web/src/app/privacy/page.tsx).

For every processor below, the DPA is **incorporated by reference into the
Terms of Service** that we (The Trader's Hindsight) accepted when we created
our account with them. We do not have separately-executed DPAs — those are
typically only offered on paid enterprise plans. The incorporated version is
legally equivalent and satisfies GDPR Article 28's "binding written contract"
requirement.

If a regulator, customer, or auditor ever asks for evidence of DPA coverage
with one of our processors, point them at the URLs below.

## Processors

### Supabase
- **What they do for us**: Database, authentication, file storage
- **DPA**: <https://supabase.com/legal/dpa>
- **Account plan as of May 2026**: Free
- **Region**: ap-southeast-2 (Sydney, Australia)
- **Note**: Separate signature only available on Pro+ ($25/mo). Free-tier
  customers are covered through ToS incorporation.

### Vercel
- **What they do for us**: Website hosting and edge serving
- **DPA**: <https://vercel.com/legal/dpa>
- **Region**: US (origin servers)

### Anthropic
- **What they do for us**: AI features (chatbot, AI insights, per-trade review)
- **DPA**: <https://www.anthropic.com/legal/commercial-terms-of-service>
  (contains the data processing terms; standalone DPA available on request)
- **No-train commitment**: Yes, Anthropic's API tier prohibits training on
  customer data by default

### Sentry
- **What they do for us**: Error monitoring and crash reporting
- **DPA**: <https://sentry.io/legal/dpa/>

### Google (OAuth / Sign in with Google)
- **What they do for us**: Authentication (when users choose "Sign in with Google")
- **DPA**: <https://cloud.google.com/terms/data-processing-addendum>
- **Limited Use Policy** (applies because we use Google API Services):
  <https://developers.google.com/terms/api-services-user-data-policy>

### Apple (Sign in with Apple)
- **What they do for us**: Authentication (when users choose "Sign in with Apple")
- **DPA**: Covered under the [Apple Developer Program License Agreement](https://developer.apple.com/support/terms/)
  and Apple's [Privacy Policy](https://www.apple.com/legal/privacy/)

### Flutterwave
- **What they do for us**: Card payment processing
- **DPA**: Covered in Flutterwave's merchant agreement and
  [Privacy Notice](https://flutterwave.com/us/privacy-notice)

### NOWPayments
- **What they do for us**: Cryptocurrency payment processing
- **DPA**: Covered in their [Privacy Policy](https://nowpayments.io/doc/fd-privacy-policy.pdf)
  and Terms of Service

## When to revisit

Review this list:

1. **Before publishing significant Privacy Policy changes** — make sure the
   processor list in the policy matches this file
2. **When adding or removing a processor** — update both this file and the
   Privacy Policy section 4
3. **When upgrading Supabase to Pro+** — sign the standalone DPA from the
   dashboard for cleaner audit trail
4. **If a customer or regulator asks for DPA evidence** — point them here
