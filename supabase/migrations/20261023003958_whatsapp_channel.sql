-- Build step 1.4 — WhatsApp channel (ESCOPO §4.2, §9).
--
-- whatsapp_numbers, whatsapp_templates, contacts, conversations, messages, message_media,
-- the private `media` bucket and its read policy.
-- Contacts/conversations are created here because every stored message belongs to one;
-- routing and the panel screens for them come in step 1.5.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function app.try_uuid(p_value text) returns uuid
  language plpgsql
  immutable
  set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function app.try_uuid(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- WhatsApp numbers (one or more per tenant). The access token is encrypted by the application
-- (AES-256-GCM, ADR-0004) and is never readable by panel users (column privileges below).
-- ---------------------------------------------------------------------------
create table public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  waba_id text not null check (waba_id ~ '^[0-9]{5,30}$'),
  display_number text not null check (length(display_number) between 5 and 30),
  access_token_enc text not null,
  token_last4 text not null default '',
  default_module text check (default_module in ('log', 'labs', 'consult', 'adm')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  verified_name text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index whatsapp_numbers_tenant_idx on public.whatsapp_numbers (tenant_id);

-- ---------------------------------------------------------------------------
-- Message templates (approved by Meta; required outside the 24 h window)
-- ---------------------------------------------------------------------------
create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waba_id text not null,
  name text not null check (name ~ '^[a-z0-9_]+$' and length(name) <= 512),
  language text not null default 'pt_BR',
  category text not null check (category in ('utility', 'marketing', 'authentication')),
  body text not null default '',
  variables_count int not null default 0 check (variables_count between 0 and 20),
  components jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'paused', 'disabled')),
  meta_template_id text,
  rejected_reason text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, waba_id, name, language)
);
create index whatsapp_templates_tenant_idx on public.whatsapp_templates (tenant_id, status);

-- ---------------------------------------------------------------------------
-- Contacts (people who talk to the tenant on WhatsApp)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  wa_id text not null check (wa_id ~ '^[0-9]{8,20}$'),
  name text,
  profile_name text,
  kind text not null default 'unknown' check (kind in ('driver', 'patient', 'staff', 'unknown')),
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users (id) on delete set null,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, wa_id),
  unique (tenant_id, id)
);
create index contacts_tenant_kind_idx on public.contacts (tenant_id, kind);

-- ---------------------------------------------------------------------------
-- Conversations: one thread per contact per WhatsApp number
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null,
  whatsapp_number_id uuid not null,
  module text check (module in ('log', 'labs', 'consult', 'adm')),
  agent_key text,
  state jsonb not null default '{}'::jsonb,
  state_expires_at timestamptz,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, contact_id, whatsapp_number_id),
  unique (tenant_id, id),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  -- A number with history cannot be deleted (disable it instead); checked at the end of the
  -- statement, so deleting a whole tenant still cascades through both tables.
  foreign key (tenant_id, whatsapp_number_id)
    references public.whatsapp_numbers (tenant_id, id) on delete no action
);
create index conversations_tenant_recent_idx on public.conversations (tenant_id, last_message_at desc);

-- ---------------------------------------------------------------------------
-- Messages (in and out). wamid is globally unique: a repeated webhook is ignored (§4.2).
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  wamid text unique,
  direction text not null check (direction in ('in', 'out')),
  author text not null default 'contact' check (author in ('contact', 'ai', 'human', 'system')),
  type text not null check (
    type in ('text', 'audio', 'image', 'document', 'video', 'sticker', 'location',
             'interactive', 'button', 'template', 'reaction', 'contacts', 'unsupported')
  ),
  text text,
  transcription text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error jsonb,
  raw jsonb,
  sent_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  constraint inbound_has_wamid check (direction = 'out' or wamid is not null)
);
create index messages_conversation_idx on public.messages (tenant_id, conversation_id, created_at desc);
create index messages_unprocessed_idx on public.messages (conversation_id, created_at)
  where direction = 'in' and processed_at is null;

create table public.message_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  message_id uuid not null,
  media_id text,
  storage_path text,
  mime text,
  size bigint,
  sha256 text,
  filename text,
  status text not null default 'pending' check (status in ('pending', 'stored', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, message_id) references public.messages (tenant_id, id) on delete cascade
);
create index message_media_message_idx on public.message_media (tenant_id, message_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.whatsapp_numbers
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.whatsapp_templates
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.contacts
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.conversations
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.messages
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.message_media
  for each row execute function app.set_updated_at();

-- Business/config tables are audited; the token never goes into the audit trail.
create trigger audit after insert or update or delete on public.whatsapp_numbers
  for each row execute function app.audit_row_change('access_token_enc');
create trigger audit after insert or update or delete on public.whatsapp_templates
  for each row execute function app.audit_row_change();
create trigger audit after insert or update or delete on public.contacts
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.whatsapp_numbers enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_media enable row level security;

create policy whatsapp_numbers_select on public.whatsapp_numbers for select to authenticated
  using (app.is_member(tenant_id));
create policy whatsapp_numbers_insert on public.whatsapp_numbers for insert to authenticated
  with check (app.has_role(tenant_id, 'admin'));
create policy whatsapp_numbers_update on public.whatsapp_numbers for update to authenticated
  using (app.has_role(tenant_id, 'admin'))
  with check (app.has_role(tenant_id, 'admin'));
create policy whatsapp_numbers_delete on public.whatsapp_numbers for delete to authenticated
  using (app.has_role(tenant_id, 'admin'));

-- The encrypted token column is write-only for users.
revoke select on public.whatsapp_numbers from authenticated;
grant select (
  id, tenant_id, phone_number_id, waba_id, display_number, token_last4, default_module, status,
  verified_name, verified_at, created_at, updated_at
) on public.whatsapp_numbers to authenticated;

create policy whatsapp_templates_select on public.whatsapp_templates for select to authenticated
  using (app.is_member(tenant_id));
create policy whatsapp_templates_insert on public.whatsapp_templates for insert to authenticated
  with check (app.has_role(tenant_id, 'admin'));
create policy whatsapp_templates_update on public.whatsapp_templates for update to authenticated
  using (app.has_role(tenant_id, 'admin'))
  with check (app.has_role(tenant_id, 'admin'));
create policy whatsapp_templates_delete on public.whatsapp_templates for delete to authenticated
  using (app.has_role(tenant_id, 'admin'));

create policy contacts_select on public.contacts for select to authenticated
  using (app.is_member(tenant_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (app.has_role(tenant_id, 'operator'));
create policy contacts_update on public.contacts for update to authenticated
  using (app.has_role(tenant_id, 'operator'))
  with check (app.has_role(tenant_id, 'operator'));
create policy contacts_delete on public.contacts for delete to authenticated
  using (app.has_role(tenant_id, 'admin'));

-- Conversations, messages and media are written by the worker (service role) only.
create policy conversations_select on public.conversations for select to authenticated
  using (app.is_member(tenant_id));
create policy messages_select on public.messages for select to authenticated
  using (app.is_member(tenant_id));
create policy message_media_select on public.message_media for select to authenticated
  using (app.is_member(tenant_id));
revoke insert, update, delete, truncate on public.conversations, public.messages, public.message_media
  from authenticated;

revoke all on
  public.whatsapp_numbers, public.whatsapp_templates, public.contacts, public.conversations,
  public.messages, public.message_media
from anon;

-- ---------------------------------------------------------------------------
-- Media bucket: private. Members of the tenant may read (signed URLs) objects under <tenant>/.
-- Only the worker writes (service role).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy media_read_by_tenant_members on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and app.is_member(app.try_uuid((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------------
-- Worker functions (service role only).
-- ---------------------------------------------------------------------------

-- Stores one inbound message atomically and idempotently: upserts the contact and the conversation,
-- inserts the message (a repeated wamid is ignored) and a pending media row when there is a file.
-- On a repeated wamid it returns inserted = false and any media row still waiting to be stored.
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
  p_media jsonb default null
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
  insert into public.contacts (tenant_id, wa_id, profile_name)
  values (p_tenant_id, p_wa_id, p_profile_name)
  on conflict (tenant_id, wa_id) do update
    set profile_name = coalesce(excluded.profile_name, public.contacts.profile_name)
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

-- Applies a delivery status to an outbound message without going backwards
-- (a late "delivered" never overwrites "read"). Returns false when the message is unknown.
create function public.apply_message_status(
  p_tenant_id uuid,
  p_wamid text,
  p_status text,
  p_at timestamptz,
  p_errors jsonb default null,
  p_pricing jsonb default null
) returns boolean
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_order text[] := array['queued', 'sent', 'delivered', 'read'];
begin
  update public.messages m set
    status = case
      when p_status = 'failed' then 'failed'
      when coalesce(array_position(v_order, p_status), 0) > coalesce(array_position(v_order, m.status), 0)
        then p_status
      else m.status
    end,
    error = case when p_status = 'failed' then p_errors else m.error end,
    payload = case when p_pricing is null then m.payload else m.payload || jsonb_build_object('pricing', p_pricing) end,
    sent_at = coalesce(m.sent_at, p_at)
  where m.tenant_id = p_tenant_id and m.wamid = p_wamid and m.direction = 'out';
  return found;
end;
$$;

revoke execute on function public.record_inbound_message(uuid, uuid, text, text, text, jsonb, jsonb, timestamptz, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.apply_message_status(uuid, text, text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_inbound_message(uuid, uuid, text, text, text, jsonb, jsonb, timestamptz, text, text, jsonb)
  to service_role;
grant execute on function public.apply_message_status(uuid, text, text, timestamptz, jsonb, jsonb)
  to service_role;
