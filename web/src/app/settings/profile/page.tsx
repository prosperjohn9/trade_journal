'use client';
import dynamic from 'next/dynamic';

const ProfileClient = dynamic(
  () =>
    import('@/src/components/settings/profile/ProfileClient').then(
      (m) => m.ProfileClient,
    ),
  { ssr: false },
);

export default function ProfileSettingsPage() {
  return <ProfileClient />;
}
