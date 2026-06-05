'use client';
import dynamic from 'next/dynamic';

const BillingClient = dynamic(
  () =>
    import('@/src/components/settings/billing/BillingClient').then(
      (m) => m.BillingClient,
    ),
  { ssr: false },
);

export default function BillingSettingsPage() {
  return <BillingClient />;
}
