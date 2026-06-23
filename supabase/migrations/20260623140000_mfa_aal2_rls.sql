-- Data-layer enforcement for opt-in two-factor auth. Until now 2FA was enforced
-- at sign-in + by the app-level MfaGuard; a determined attacker holding an aal1
-- session token could still hit the REST API directly. This adds a RESTRICTIVE
-- RLS policy (AND-ed with the existing owner policies) requiring aal2 for any
-- user who has a VERIFIED factor. Everyone without 2FA is unaffected (the gate
-- returns true for them), and the service role bypasses RLS entirely, so cron /
-- worker / webhooks are untouched.

-- Helper: true when the session is aal2, OR the user has not enrolled a verified
-- factor (so non-2FA users always pass). SECURITY DEFINER so it can read
-- auth.mfa_factors; STABLE so the planner evaluates it once per query.
create or replace function public.mfa_aal2_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = (select auth.uid())
        and f.status = 'verified'
    );
$$;

-- Only authenticated needs it (the policies call it). Supabase's default
-- privileges also grant new public functions to anon, so revoke that explicitly.
revoke all on function public.mfa_aal2_satisfied() from public;
revoke execute on function public.mfa_aal2_satisfied() from anon;
grant execute on function public.mfa_aal2_satisfied() to authenticated;

-- Apply a restrictive aal2 gate to every user-facing table. contact_messages is
-- intentionally excluded (support submissions must never be gated), as are the
-- service-role-only billing_* tables (no user access anyway).
do $$
declare
  t text;
  tables text[] := array[
    'account_balance_events', 'account_tags', 'accounts', 'ai_insights',
    'ai_usage', 'ctrader_connections', 'ctrader_oauth', 'foresight_news_alerts',
    'foresight_reads', 'mt_connections', 'mt_refreshes', 'profiles',
    'prop_ledger', 'setup_template_items', 'setup_templates', 'subscription_addons',
    'subscriptions', 'tags', 'trade_ai_reviews', 'trade_criteria_checks',
    'trade_groups', 'trades', 'trading_rules'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop policy if exists mfa_aal2_required on public.%I',
      t
    );
    execute format(
      'create policy mfa_aal2_required on public.%I as restrictive for all '
      || 'to authenticated using ((select public.mfa_aal2_satisfied())) '
      || 'with check ((select public.mfa_aal2_satisfied()))',
      t
    );
  end loop;
end $$;
