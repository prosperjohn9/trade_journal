'use client';
import dynamic from 'next/dynamic';

const AccountsClient = dynamic(
  () => import('@/src/components/settings/accounts/AccountsClient').then((m) => m.AccountsClient),
  { ssr: false },
);

export default function AccountsSettingsPage() {
  return <AccountsClient />;
}
