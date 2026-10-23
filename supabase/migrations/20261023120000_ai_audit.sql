-- Build step 1.6 — AI audit trail (ESCOPO §4.8): ai_runs, ai_tool_calls, ai_citations.
--
-- Written only by the worker (service role); read by managers and up. Rows are immutable for
-- users. ai_citations.chunk_id gets its foreign key when document_chunks exists (step 1.7).

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid,
  message_id uuid,
  agent_key text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  turns integer not null default 0 check (turns >= 0),
  outcome text not null check (outcome in ('answered', 'handoff', 'error')),
  handoff_reason text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade
);
create index ai_runs_tenant_created_idx on public.ai_runs (tenant_id, created_at desc);
create index ai_runs_conversation_idx on public.ai_runs (tenant_id, conversation_id, created_at desc);

create table public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ai_run_id uuid not null,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  result_summary text,
  is_error boolean not null default false,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, ai_run_id) references public.ai_runs (tenant_id, id) on delete cascade
);
create index ai_tool_calls_run_idx on public.ai_tool_calls (tenant_id, ai_run_id);

create table public.ai_citations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ai_run_id uuid not null,
  chunk_id uuid not null,
  document_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, ai_run_id) references public.ai_runs (tenant_id, id) on delete cascade
);
create index ai_citations_run_idx on public.ai_citations (tenant_id, ai_run_id);

create trigger set_updated_at before update on public.ai_runs
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.ai_tool_calls
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.ai_citations
  for each row execute function app.set_updated_at();

alter table public.ai_runs enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_citations enable row level security;

create policy ai_runs_select on public.ai_runs for select to authenticated
  using (app.has_role(tenant_id, 'manager'));
create policy ai_tool_calls_select on public.ai_tool_calls for select to authenticated
  using (app.has_role(tenant_id, 'manager'));
create policy ai_citations_select on public.ai_citations for select to authenticated
  using (app.has_role(tenant_id, 'manager'));

-- Users only read; the worker writes (and never edits history).
revoke insert, update, delete, truncate on public.ai_runs, public.ai_tool_calls, public.ai_citations
  from anon, authenticated;
revoke all on public.ai_runs, public.ai_tool_calls, public.ai_citations from anon;
