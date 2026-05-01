'use client';
import dynamic from 'next/dynamic';

const SetupsClient = dynamic(
  () => import('@/src/components/settings/setups/SetupsClient').then((m) => m.SetupsClient),
  { ssr: false },
);

export default function SetupsPage() {
  return <SetupsClient />;
}
