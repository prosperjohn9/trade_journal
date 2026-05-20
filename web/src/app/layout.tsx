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
    // suppressHydrationWarning is intentional: browser extensions (password
    // managers, accessibility tools, productivity trackers) routinely inject
    // attributes like `data-qb-installed` onto <html> after server-rendered
    // HTML loads but before React hydrates. Without this prop React logs a
    // dev-only hydration mismatch warning we can't fix from our side.
    <html lang='en' suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
