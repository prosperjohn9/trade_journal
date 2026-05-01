'use client';
import dynamic from 'next/dynamic';

const DashboardClient = dynamic(
  () => import('@/src/components/dashboard/DashboardClient'),
  { ssr: false },
);

export default function DashboardPage() {
  return <DashboardClient />;
}
