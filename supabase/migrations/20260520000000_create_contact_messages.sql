-- Contact form submissions captured from the public /contact page.
-- Anonymous (signed-out) and authenticated users can both INSERT — this is a
-- public contact form, not a logged-in feature. Nobody can SELECT, UPDATE, or
-- DELETE from the client; admin reads via Supabase dashboard or service-role
-- key. That keeps the table abuse-resistant while letting submissions flow in.
--
-- Why a table instead of an outbound email-only flow: we want a durable record
-- of every message even before a transactional email provider (Resend, etc.) is
-- wired up. Once that's wired, a Supabase Database Webhook on this table can
-- fire the actual email — but messages never get dropped in the meantime.

CREATE TABLE contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Submission content (validated at insert time via WITH CHECK below).
  name          text,
  email         text NOT NULL,
  request_type  text NOT NULL CHECK (request_type IN (
    'general',
    'privacy',
    'billing',
    'account',
    'other'
  )),
  message       text NOT NULL,

  -- Admin tracking (only ever set by the operator from the Supabase dashboard).
  is_resolved   boolean NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  notes         text
);

-- Index for the typical admin view: newest first.
CREATE INDEX contact_messages_created_at_idx
  ON contact_messages (created_at DESC);

-- Partial index for the unresolved-only filter (much smaller, fast scans).
CREATE INDEX contact_messages_unresolved_idx
  ON contact_messages (created_at DESC)
  WHERE is_resolved = false;

-- RLS on. Without these policies anon/authenticated roles have no access.
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- The only thing client-side roles can do: submit a new message.
-- Validation is enforced in the policy itself so a malformed payload never
-- reaches the table — no email-shaped check on `email`, length caps on
-- everything, and the request_type whitelist is already enforced by the
-- column CHECK constraint above.
CREATE POLICY "Anyone may submit a contact message"
  ON contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
        length(email) BETWEEN 5 AND 254
    AND email LIKE '%_@_%.__%'
    AND length(message) BETWEEN 10 AND 5000
    AND length(coalesce(name, '')) <= 200
  );

-- No SELECT/UPDATE/DELETE policy = denied for anon and authenticated. The
-- operator reads through the Supabase dashboard (which uses the service-role
-- key and bypasses RLS).

COMMENT ON TABLE contact_messages IS
  'Public contact-form submissions. Insert-only from clients; admin reads via Supabase dashboard.';
