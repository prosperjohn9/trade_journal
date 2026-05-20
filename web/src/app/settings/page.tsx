'use client';
import dynamic from 'next/dynamic';

const SettingsIndex = dynamic(
  () =>
    import('@/src/components/settings/SettingsIndex').then(
      (m) => m.SettingsIndex,
    ),
  { ssr: false },
);

export default function SettingsPage() {
  return <SettingsIndex />;
}
