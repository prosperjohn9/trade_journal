'use client';

import useSWR from 'swr';
import { supabase } from '@/src/lib/supabase/client';
import {
  resolveEntitlements,
  SUBSCRIPTION_SELECT,
  type Entitlements,
  type SubscriptionRow,
} from '@/src/lib/billing/entitlements';

async function loadSubscription(): Promise<SubscriptionRow | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .maybeSingle();
  return (data as SubscriptionRow | null) ?? null;
}

/**
 * Client-side entitlements for paywall UI. The server independently enforces the
 * same rules on the costly endpoints; this hook only drives what the UI shows.
 */
export function useEntitlements(): {
  entitlements: Entitlements;
  loading: boolean;
} {
  const { data, isLoading } = useSWR('subscription', loadSubscription);
  return {
    entitlements: resolveEntitlements(data ?? null),
    loading: isLoading,
  };
}
