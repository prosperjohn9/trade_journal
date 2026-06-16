'use client';

import { supabase } from '@/src/lib/supabase/client';

/** API error that keeps the server's machine-readable `code` so the UI can
 *  distinguish plan-gate errors (upgrade prompts) from real failures. */
export class ApiError extends Error {
  code: string | null;
  status: number;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const UPGRADE_CODES = new Set([
  'upgrade_required', // feature locked (no active plan)
  'limit_reached', // synced-account count at plan limit
  'quota_reached', // AI monthly actions spent
  'manual_refresh_limit', // manual broker refreshes spent
]);

/** True when the error is a plan gate the user can fix by upgrading. */
export function isUpgradeError(e: unknown): e is ApiError {
  return e instanceof ApiError && e.code != null && UPGRADE_CODES.has(e.code);
}

export async function apiFetch<T>(path: string): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // `cache: 'no-store'` is critical for correctness: SWR drives revalidations
  // after mutations (delete, edit, review), and if the browser HTTP cache
  // returns a stale response that still includes the mutated row, the UI
  // appears not to have updated. SWR has its own client-side dedup/cache so
  // we still get fast repeat reads — we just don't double-cache at the HTTP
  // layer where stale data corrupts the post-mutation UI.
  const res = await fetch(path, {
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error || `Request failed (${res.status})`,
      res.status,
      typeof body.code === 'string' ? body.code : null,
    );
  }

  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      errBody.error || `Request failed (${res.status})`,
      res.status,
      typeof errBody.code === 'string' ? errBody.code : null,
    );
  }

  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(path, {
    method: 'DELETE',
    cache: 'no-store',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) throw new Error('Not authenticated');
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      errBody.error || `Request failed (${res.status})`,
      res.status,
      typeof errBody.code === 'string' ? errBody.code : null,
    );
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
