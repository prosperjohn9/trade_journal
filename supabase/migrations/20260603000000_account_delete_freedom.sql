-- Allow deleting any trading account — including the default one and accounts
-- that already have trades. Deleting an account now removes its trades too
-- (trade_criteria_checks / trade_ai_reviews already cascade from trades).

alter table public.trades drop constraint if exists trades_account_id_fkey;
alter table public.trades
  add constraint trades_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete cascade;

create or replace function public.delete_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid;
  v_was_default boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select is_default into v_was_default
  from public.accounts
  where id = p_account_id and user_id = v_user_id;

  if v_was_default is null then
    raise exception 'Account not found or not yours';
  end if;

  delete from public.accounts
  where id = p_account_id and user_id = v_user_id;

  -- If the default was removed, promote the oldest remaining account.
  if v_was_default then
    update public.accounts
    set is_default = true
    where id = (
      select id from public.accounts
      where user_id = v_user_id
      order by created_at asc
      limit 1
    );
  end if;
end;
$function$;
