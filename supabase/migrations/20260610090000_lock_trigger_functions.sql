-- Trigger functions are invoked by triggers, never by clients, yet PostgREST
-- exposes any function in the public schema as an RPC endpoint. Revoke EXECUTE
-- so anon/authenticated callers cannot invoke these SECURITY DEFINER functions
-- directly (flagged by the Supabase security advisor). Triggers keep working:
-- they run as the table owner, not the caller.

revoke execute on function public.mark_ai_review_stale_on_trade_change() from public, anon, authenticated;
revoke execute on function public.notify_new_contact_message() from public, anon, authenticated;
