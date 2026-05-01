import dynamic from 'next/dynamic';

const TradeReviewClient = dynamic(
  () => import('@/src/components/trades/review/TradeReviewClient').then((m) => m.TradeReviewClient),
  { ssr: false },
);

export default function TradeReviewPage() {
  return <TradeReviewClient />;
}
