import dynamic from 'next/dynamic';

const NewTradeClient = dynamic(
  () => import('@/src/components/trades/new/NewTradeClient').then((m) => m.NewTradeClient),
  { ssr: false },
);

export default function NewTradePage() {
  return <NewTradeClient />;
}
