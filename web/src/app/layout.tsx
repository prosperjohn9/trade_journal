import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TradersHindsight — The trading journal that pays you back',
  description:
    'Hindsight is 20/20. Now you can keep it. TradersHindsight is the trading journal that turns every win and every loss into a documented lesson, so you stop repeating mistakes and start compounding what works.',
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
