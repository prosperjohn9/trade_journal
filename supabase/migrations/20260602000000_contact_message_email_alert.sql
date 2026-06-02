-- Email alert when a contact message is inserted (contact form, or the in-app
-- assistant's off-hours "talk to a human" handoff). Uses pg_net to call Resend
-- asynchronously, with the API key + recipient read from Vault, so the insert is
-- never blocked and no secret lives in source control.
--
-- Configuration (set once in Supabase Vault; the trigger no-ops until then):
--   resend_api_key       -- a Resend API key (re_...)
--   contact_notify_email -- where alerts go (must match the Resend account email
--                            until a sending domain is verified in Resend)

create extension if not exists pg_net;

create or replace function public.notify_new_contact_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_key     text;
  v_to      text;
  v_from    text := 'The Trader''s Hindsight <onboarding@resend.dev>';
  v_subject text;
  v_html    text;
  v_msg     text;
  v_name    text;
begin
  -- Resend API key from Vault; if absent, do nothing (feature not configured).
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if v_key is null or length(v_key) = 0 then
    return new;
  end if;

  -- Recipient from Vault, else the public support address.
  select decrypted_secret into v_to
  from vault.decrypted_secrets where name = 'contact_notify_email' limit 1;
  if v_to is null or length(v_to) = 0 then
    v_to := 'support@tradershindsight.com';
  end if;

  -- Escape user-supplied fields before embedding in HTML.
  v_msg  := replace(replace(replace(coalesce(new.message, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  v_name := replace(replace(replace(coalesce(new.name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  v_subject := 'New ' || coalesce(new.request_type, 'contact') || ' message'
            || case when v_name <> '' then ' from ' || v_name else '' end;

  v_html := '<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;color:#111">'
         || '<h2 style="margin:0 0 12px">New contact message</h2>'
         || '<p><strong>From:</strong> ' || coalesce(new.email, '(none)')
         || case when v_name <> '' then ' (' || v_name || ')' else '' end || '</p>'
         || '<p><strong>Type:</strong> ' || coalesce(new.request_type, '(none)') || '</p>'
         || '<p><strong>Received:</strong> ' || coalesce(new.created_at::text, '') || '</p>'
         || '<hr style="border:none;border-top:1px solid #ddd;margin:12px 0">'
         || '<div style="white-space:pre-wrap">' || v_msg || '</div>'
         || '<p style="color:#888;margin-top:16px">Reply to this email to respond directly to '
         || coalesce(new.email, 'the sender') || '.</p></div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', v_from,
      'to', jsonb_build_array(v_to),
      'subject', v_subject,
      'html', v_html,
      'reply_to', new.email
    )
  );

  return new;
exception when others then
  return new;  -- never let a notification failure block the insert
end;
$fn$;

revoke all on function public.notify_new_contact_message() from public;

drop trigger if exists trg_notify_new_contact_message on public.contact_messages;
create trigger trg_notify_new_contact_message
  after insert on public.contact_messages
  for each row execute function public.notify_new_contact_message();

comment on function public.notify_new_contact_message() is
  'Sends an email via Resend (pg_net, async) when a contact_messages row is inserted. Reads resend_api_key and contact_notify_email from Vault; no-ops if the key is unset.';
