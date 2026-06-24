import type { Metadata } from 'next';
import './globals.css';
import { ChatWidget } from '@/src/components/ai/ChatWidget';
import { MfaGuard } from '@/src/components/auth/MfaGuard';

export const metadata: Metadata = {
  title: "The Trader's Hindsight — Make your experience your edge",
  description:
    "Make your experience your edge. The Trader's Hindsight is the trading journal where every trade becomes a lesson and every lesson becomes part of how you trade next.",
};

// Resolve the saved theme BEFORE first paint so there is no light/dark flash.
// 'light'/'dark' pin the theme; anything else (including absent = first visit)
// leaves data-theme off so the CSS prefers-color-scheme rules follow the OS
// live. Shares the 'dashboard-theme' key with the rest of the app.
const THEME_INIT = `(function(){try{var k="dashboard-theme",t=localStorage.getItem(k),d=document.documentElement;if(t==="light"||t==="dark"){d.setAttribute("data-theme",t);d.style.colorScheme=t;}else{d.removeAttribute("data-theme");d.style.colorScheme="light dark";}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is intentional: browser extensions (password
    // managers, accessibility tools, productivity trackers) routinely inject
    // attributes like `data-qb-installed` onto <html> after server-rendered
    // HTML loads but before React hydrates. The theme-init script below also
    // sets data-theme on <html> before hydration, which we suppress here too.
    // The dashboard-theme class makes the CSS design tokens resolve globally.
    <html
      lang='en'
      className='dashboard-theme'
      suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className='bg-[var(--bg-app)] text-[var(--text-primary)] antialiased'>
        <MfaGuard />
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
