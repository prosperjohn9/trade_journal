import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!anonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // PKCE returns an auth code to /auth/callback (which exchanges it), keeping
    // OAuth and magic-link consistent. detectSessionInUrl finishes the session
    // automatically when a code/token lands on a page that loads this client.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    // Never serve API reads from the browser HTTP cache. A stale cached read
    // after a write (e.g. archiving an account, then reloading) would otherwise
    // show the old value and make the change look like it reverted.
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});