-- The accounts list reads from the accounts_with_tags view, which lists explicit
-- columns and so did not pick up accounts.archived (added in
-- 20260619170000_accounts_archived). Selecting archived through the view errored
-- with "column accounts_with_tags.archived does not exist". Recreate the view
-- with the column appended at the end (CREATE OR REPLACE VIEW keeps existing
-- column order and only allows appends).

create or replace view public.accounts_with_tags as
 SELECT a.id,
    a.user_id,
    a.name,
    a.starting_balance,
    a.created_at,
    a.is_default,
    a.base_currency,
    a.updated_at,
    a.account_type,
    COALESCE(array_agg(t.name::text ORDER BY (t.name::text)) FILTER (WHERE t.id IS NOT NULL), '{}'::text[]) AS tags,
    a.archived
   FROM accounts a
     LEFT JOIN account_tags at ON at.account_id = a.id
     LEFT JOIN tags t ON t.id = at.tag_id
  GROUP BY a.id;
