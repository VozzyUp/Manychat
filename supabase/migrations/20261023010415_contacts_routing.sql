-- Build step 1.5 — contacts, conversations and routing (ESCOPO §4.3, §9, §10 LGPD).
--
-- consents and handoffs tables; LGPD anonymization of a contact (which also scrubs the audit
-- trail); cleanup of expired conversation state (§4.10).

-- ---------------------------------------------------------------------------
-- Consents (LGPD). Patients accept the privacy notice before any personal data is stored (§6.2).
-- ---------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null,
  type text not null check (type in ('privacy_notice', 'data_processing', 'marketing')),
  version text not null check (length(version) between 1 and 40),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'panel')),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  evidence_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade
);
create index consents_contact_idx on public.consents (tenant_id, contact_id, type);

-- ---------------------------------------------------------------------------
-- Handoffs to a human (§4.7). While one is open, the AI stays silent in that conversation.
-- ---------------------------------------------------------------------------
create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  reason text not null check (
    reason in ('no_knowledge', 'no_citation', 'user_request', 'urgency', 'ai_error', 'max_turns',
               'unidentified', 'manual', 'other')
  ),
  summary text,
  status text not null default 'open' check (status in ('open', 'closed')),
  chatwoot_conversation_id text,
  opened_by text not null default 'ai' check (opened_by in ('ai', 'user', 'system')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  constraint closed_has_time check (status = 'open' or closed_at is not null)
);
create index handoffs_tenant_status_idx on public.handoffs (tenant_id, status, opened_at desc);
create unique index handoffs_one_open_per_conversation on public.handoffs (conversation_id) where status = 'open';

create trigger set_updated_at before update on public.consents
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.handoffs
  for each row execute function app.set_updated_at();
create trigger audit after insert or update or delete on public.consents
  for each row execute function app.audit_row_change();
create trigger audit after insert or update or delete on public.handoffs
  for each row execute function app.audit_row_change();

alter table public.consents enable row level security;
alter table public.handoffs enable row level security;

create policy consents_select on public.consents for select to authenticated
  using (app.is_member(tenant_id));
create policy consents_insert on public.consents for insert to authenticated
  with check (app.has_role(tenant_id, 'operator'));
create policy consents_update on public.consents for update to authenticated
  using (app.has_role(tenant_id, 'operator'))
  with check (app.has_role(tenant_id, 'operator'));

create policy handoffs_select on public.handoffs for select to authenticated
  using (app.is_member(tenant_id));
create policy handoffs_update on public.handoffs for update to authenticated
  using (app.has_role(tenant_id, 'operator'))
  with check (app.has_role(tenant_id, 'operator'));
-- Handoffs are opened by the AI/worker; users only close them.
revoke insert, delete on public.handoffs from authenticated;

revoke all on public.consents, public.handoffs from anon;

-- ---------------------------------------------------------------------------
-- LGPD: anonymize a contact on request (§10). Removes personal data from the contact, its
-- messages and media rows, and scrubs before/after of its audit entries (the only exception to the
-- audit trail being immutable — done here, by the table owner, and recorded). Returns the storage
-- paths of the media files so the caller deletes the objects.
-- ---------------------------------------------------------------------------
create function public.anonymize_contact(p_tenant_id uuid, p_contact_id uuid, p_actor uuid default null)
  returns setof text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_paths text[];
begin
  if not exists (select 1 from public.contacts where id = p_contact_id and tenant_id = p_tenant_id) then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(mm.storage_path) filter (where mm.storage_path is not null), '{}')
    into v_paths
    from public.message_media mm
    join public.messages m on m.id = mm.message_id
    join public.conversations c on c.id = m.conversation_id
   where c.contact_id = p_contact_id and c.tenant_id = p_tenant_id;

  delete from public.message_media mm
   using public.messages m, public.conversations c
   where mm.message_id = m.id and m.conversation_id = c.id
     and c.contact_id = p_contact_id and c.tenant_id = p_tenant_id;

  update public.messages m
     set text = null, transcription = null, raw = null, payload = '{}'::jsonb, error = null
    from public.conversations c
   where m.conversation_id = c.id and c.contact_id = p_contact_id and c.tenant_id = p_tenant_id;

  update public.conversations
     set state = '{}'::jsonb, state_expires_at = null
   where contact_id = p_contact_id and tenant_id = p_tenant_id;

  update public.handoffs h
     set summary = null
    from public.conversations c
   where h.conversation_id = c.id and c.contact_id = p_contact_id and c.tenant_id = p_tenant_id;

  -- Random digits starting with 00 (no real WhatsApp id does): unique, but nobody's number.
  update public.contacts
     set name = null,
         profile_name = null,
         wa_id = '00' || lpad((floor(random() * 1e15))::bigint::text, 15, '0'),
         metadata = '{}'::jsonb,
         user_id = null,
         anonymized_at = now()
   where id = p_contact_id and tenant_id = p_tenant_id;

  update public.audit_log
     set before = case when before is null then null else jsonb_build_object('anonymized', true) end,
         after = case when after is null then null else jsonb_build_object('anonymized', true) end
   where tenant_id = p_tenant_id and entity = 'contacts' and entity_id = p_contact_id;

  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, after)
  values (p_tenant_id, p_actor, 'update', 'contacts', p_contact_id,
          jsonb_build_object('anonymized', true, 'media_files', coalesce(array_length(v_paths, 1), 0)));

  return query select unnest(v_paths);
end;
$$;

-- ---------------------------------------------------------------------------
-- §4.10: forget conversation state (and the sticky module) once it expires, so the next
-- message is routed again from scratch.
-- ---------------------------------------------------------------------------
create function public.cleanup_expired_conversation_state() returns integer
  language sql
  security invoker
  set search_path = ''
as $$
  with expired as (
    update public.conversations
       set state = '{}'::jsonb, state_expires_at = null, module = null, agent_key = null
     where state_expires_at is not null and state_expires_at < now()
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.anonymize_contact(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.cleanup_expired_conversation_state() from public, anon, authenticated;
grant execute on function public.anonymize_contact(uuid, uuid, uuid) to service_role;
grant execute on function public.cleanup_expired_conversation_state() to service_role;

-- ---------------------------------------------------------------------------
-- record_inbound_message v2: contacts are matched by the canonical WhatsApp id (Brazilian mobiles
-- may arrive without the extra 9); the id exactly as WhatsApp sent it is kept in
-- metadata.wa_id_seen and used to reply.
-- ---------------------------------------------------------------------------
drop function public.record_inbound_message(uuid, uuid, text, text, text, jsonb, jsonb, timestamptz, text, text, jsonb);

create function public.record_inbound_message(
  p_tenant_id uuid,
  p_whatsapp_number_id uuid,
  p_wa_id text,
  p_wamid text,
  p_type text,
  p_payload jsonb,
  p_raw jsonb,
  p_sent_at timestamptz,
  p_profile_name text default null,
  p_text text default null,
  p_media jsonb default null,
  p_wa_id_seen text default null
) returns table (message_id uuid, conversation_id uuid, contact_id uuid, inserted boolean, media_row_id uuid)
  language plpgsql
  security invoker
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_contact uuid;
  v_conversation uuid;
  v_message uuid;
  v_media uuid;
begin
  insert into public.contacts (tenant_id, wa_id, profile_name, metadata)
  values (
    p_tenant_id, p_wa_id, p_profile_name,
    case when p_wa_id_seen is null then '{}'::jsonb else jsonb_build_object('wa_id_seen', p_wa_id_seen) end
  )
  on conflict (tenant_id, wa_id) do update
    set profile_name = coalesce(excluded.profile_name, public.contacts.profile_name),
        metadata = case
          when p_wa_id_seen is null then public.contacts.metadata
          else public.contacts.metadata || jsonb_build_object('wa_id_seen', p_wa_id_seen)
        end
  returning id into v_contact;

  insert into public.conversations (tenant_id, contact_id, whatsapp_number_id, last_inbound_at, last_message_at)
  values (p_tenant_id, v_contact, p_whatsapp_number_id, p_sent_at, p_sent_at)
  on conflict (tenant_id, contact_id, whatsapp_number_id) do update
    set last_inbound_at = greatest(public.conversations.last_inbound_at, excluded.last_inbound_at),
        last_message_at = greatest(public.conversations.last_message_at, excluded.last_message_at)
  returning id into v_conversation;

  insert into public.messages (
    tenant_id, conversation_id, wamid, direction, author, type, text, payload, raw, sent_at, status
  )
  values (
    p_tenant_id, v_conversation, p_wamid, 'in', 'contact', p_type, p_text,
    coalesce(p_payload, '{}'::jsonb), p_raw, p_sent_at, 'received'
  )
  on conflict (wamid) do nothing
  returning id into v_message;

  if v_message is null then
    select m.id into v_message from public.messages m
     where m.wamid = p_wamid and m.tenant_id = p_tenant_id;
    select mm.id into v_media from public.message_media mm
     where mm.tenant_id = p_tenant_id and mm.message_id = v_message and mm.status <> 'stored'
     limit 1;
    return query select v_message, v_conversation, v_contact, false, v_media;
    return;
  end if;

  if p_media is not null then
    insert into public.message_media (tenant_id, message_id, media_id, mime, sha256, filename)
    values (p_tenant_id, v_message, p_media ->> 'id', p_media ->> 'mime', p_media ->> 'sha256', p_media ->> 'filename')
    returning id into v_media;
  end if;

  return query select v_message, v_conversation, v_contact, true, v_media;
end;
$$;

revoke execute on function public.record_inbound_message(uuid, uuid, text, text, text, jsonb, jsonb, timestamptz, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_inbound_message(uuid, uuid, text, text, text, jsonb, jsonb, timestamptz, text, text, jsonb, text)
  to service_role;
