import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : '';

// Authenticated app pages are personalized and must always reflect the latest
// data and the latest deployed code. Without this, a browser or CDN can serve a
// stale cached copy of the page document (which references old JS bundles),
// making a just-made change look like it reverted on reload. Static assets under
// /_next/static stay immutably cached (they are content-hashed, never stale).
const NO_STORE = [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname }]
      : [],
  },
  async headers() {
    return [
      { source: '/dashboard', headers: NO_STORE },
      { source: '/settings', headers: NO_STORE },
      { source: '/settings/:path*', headers: NO_STORE },
      { source: '/trades/:path*', headers: NO_STORE },
      { source: '/analytics', headers: NO_STORE },
      { source: '/reports/:path*', headers: NO_STORE },
      { source: '/foresight', headers: NO_STORE },
    ];
  },
};

export default nextConfig;
