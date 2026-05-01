import dynamic from 'next/dynamic';

const AnalyticsClient = dynamic(
  () => import('@/src/components/analytics/AnalyticsClient').then((m) => m.AnalyticsClient),
  { ssr: false },
);

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
