-- Schema inicial do ManyChat próprio.
create extension if not exists pgcrypto;

create table channels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('instagram', 'messenger', 'whatsapp')),
  name text not null,
  -- instagram: ID da conta IG profissional; messenger: ID da página; whatsapp: phone_number_id
  external_id text not null,
  access_token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (type, external_id)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels (id) on delete cascade,
  external_id text not null,
  name text,
  tags text[] not null default '{}',
  fields jsonb not null default '{}',
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, external_id)
);

create table flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default false,
  priority integer not null default 0,
  channel_types text[] not null default '{}',
  trigger jsonb not null,
  steps jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  kind text not null,
  text text,
  payload text,
  -- ID da Meta (mid, wamid, comment_id). Único para ignorar reenvios do webhook.
  external_id text unique,
  status text not null default 'ok',
  error text,
  created_at timestamptz not null default now()
);
create index messages_contact_idx on messages (contact_id, created_at);

create table flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows (id) on delete cascade,
  contact_id uuid not null references contacts (id) on delete cascade,
  status text not null check (status in ('active', 'waiting_delay', 'waiting_input', 'done', 'failed', 'cancelled')),
  step_id text,
  resume_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index flow_runs_due_idx on flow_runs (status, resume_at);
create index flow_runs_contact_idx on flow_runs (contact_id, status);

-- Só o servidor (service role) acessa. Sem políticas = nada liberado para anon.
alter table channels enable row level security;
alter table contacts enable row level security;
alter table flows enable row level security;
alter table messages enable row level security;
alter table flow_runs enable row level security;
