import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "The Trader's Hindsight — Make your experience your edge",
  description:
    "Make your experience your edge. The Trader's Hindsight is the trading journal where every trade becomes a lesson and every lesson becomes part of how you trade next.",
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
