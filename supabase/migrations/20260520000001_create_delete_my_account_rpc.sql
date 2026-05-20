-- Lets a signed-in user delete their own account from inside the app, as
-- promised in our Privacy Policy ("You can delete your account at any time
-- from inside the Service").
--
-- All public.* tables that reference auth.users(id) already have
-- ON DELETE CASCADE, so deleting the auth.users row triggers cascade cleanup
-- of trades, accounts, setup_templates, tags, trade_groups, profiles, etc.
-- We also wipe storage.objects owned by the user — trade screenshots and any
-- other uploaded files — because cascade rules don't apply to storage.
--
-- SECURITY DEFINER is required because auth.users is owned by the supabase
-- auth admin role, not by authenticated users. We narrow the blast radius
-- by (a) keying off auth.uid() so a caller can only ever delete themselves,
-- (b) revoking PUBLIC and granting EXECUTE only to authenticated, and
-- (c) pinning search_path so nobody can hijack table resolution.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Storage cleanup first (no cascade from auth.users for storage.objects).
  -- Anything the user uploaded — trade screenshots, future avatars — is
  -- tagged with their UUID in storage.objects.owner.
  DELETE FROM storage.objects WHERE owner = current_user_id;

  -- Now the auth row. Cascade does the rest.
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMENT ON FUNCTION public.delete_my_account() IS
  'Hard-deletes the caller''s auth user and storage objects. Public.* cascades clean up trades, accounts, setups, etc. Callable only by authenticated users, only for themselves.';
