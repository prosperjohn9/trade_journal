-- Fix FK on trade_group_legs.account_id to cascade on account deletion.
-- Without this, deleting an account fails if any trade_group_legs row references it.

ALTER TABLE trade_group_legs
  DROP CONSTRAINT IF EXISTS trade_group_legs_account_id_fkey;

ALTER TABLE trade_group_legs
  ADD CONSTRAINT trade_group_legs_account_id_fkey
    FOREIGN KEY (account_id)
    REFERENCES accounts(id)
    ON DELETE CASCADE;
