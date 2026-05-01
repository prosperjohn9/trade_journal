'use client';
import dynamic from 'next/dynamic';

const TradeEditClient = dynamic(
  () => import('@/src/components/trades/edit/TradeEditClient').then((m) => m.TradeEditClient),
  { ssr: false },
);

export default function EditTradePage() {
  return <TradeEditClient />;
}
