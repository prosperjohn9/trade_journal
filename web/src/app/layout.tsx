import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TradersHindsight — Make your experience your edge',
  description:
    'Make your experience your edge. TradersHindsight is the trading journal where every trade becomes a lesson and every lesson becomes part of how you trade next.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
