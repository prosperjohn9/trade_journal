-- Archive flag for accounts. Archived accounts (e.g. a breached challenge) drop
-- out of the main accounts list to keep it clean, but stay fully accessible and
-- can be unarchived. Breach auto-archives; the user can also toggle it manually.

alter table public.accounts
  add column if not exists archived boolean not null default false;
