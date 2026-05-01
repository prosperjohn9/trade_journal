import dynamic from 'next/dynamic';

const MonthlyReportClient = dynamic(
  () => import('@/src/components/reports/monthly/MonthlyReportClient').then((m) => m.MonthlyReportClient),
  { ssr: false },
);

export default function MonthlyReportPage() {
  return <MonthlyReportClient />;
}
