-- Supabase now blocks SQL deletes on storage tables, which broke
-- delete_my_account() (it died at DELETE FROM storage.objects before reaching
-- the user row). Account self-deletion moved to /api/account/delete, which
-- removes files via the Storage API and deletes the user via the admin API.
-- Drop the broken function so no client can call a half-working path.

drop function if exists public.delete_my_account();
