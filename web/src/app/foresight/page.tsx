import type { Metadata } from 'next';
import { ForesightLogClient } from '@/src/components/foresight/ForesightLogClient';

export const metadata: Metadata = {
  title: "Foresight reads — The Trader's Hindsight",
};

export default function ForesightPage() {
  return <ForesightLogClient />;
}
