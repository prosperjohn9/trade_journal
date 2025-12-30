import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Completes the login when the user clicks the magic link
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Bypass auth page and go straight to dashboard
  return NextResponse.redirect(new URL('/dashboard', url.origin));
}