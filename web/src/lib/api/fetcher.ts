'use client';

import { supabase } from '@/src/lib/supabase/client';

export async function apiFetch<T>(path: string): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, v);
  }
  const str = q.toString();
  return str ? `?${str}` : '';
}
