'use client';
import dynamic from 'next/dynamic';

const TwoFactorCard = dynamic(
  () =>
    import('@/src/components/settings/security/TwoFactorCard').then(
      (m) => m.TwoFactorCard,
    ),
  { ssr: false },
);

export default function SecuritySettingsPage() {
  return (
    <div className='mx-auto w-full max-w-2xl px-4 py-8'>
      <h1 className='mb-1 text-2xl font-semibold text-[var(--text-primary)]'>
        Security
      </h1>
      <p className='mb-6 text-sm text-[var(--text-secondary)]'>
        Protect your account with an optional second factor.
      </p>
      <TwoFactorCard />
    </div>
  );
}
