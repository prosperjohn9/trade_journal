import dynamic from 'next/dynamic';

const TradeViewClient = dynamic(
  () => import('@/src/components/trades/view/TradeViewClient').then((m) => m.TradeViewClient),
  { ssr: false },
);

export default function TradeViewPage() {
  return <TradeViewClient />;
}
