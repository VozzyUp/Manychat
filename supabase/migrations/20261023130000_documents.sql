-- Build step 1.7 — documents, versions and chunks (ESCOPO §4.5, ADR-0005, ADR-0007).
--
-- Writes from the panel go through apps/api with the user's JWT (RLS below decides who). The
-- worker (service role) fills ingestion fields and chunks. Only approved AND ingested AND activated
-- versions feed the AI; activation (and making the previous version obsolete) happens when the new
-- version's ingestion is ready, so a failed ingestion never leaves the tenant without knowledge.

create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;

create function app.immutable_unaccent(p_text text) returns text
  language sql immutable parallel safe
  set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, p_text) $$;

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  collection text not null check (
    collection in ('pop', 'manual', 'norma', 'contrato', 'politica', 'faq', 'preparo_exame', 'outro')
  ),
  code text check (code is null or length(code) between 1 and 40),
  title text not null check (length(title) between 1 and 200),
  owner_user_id uuid references auth.users (id) on delete set null,
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index documents_code_unique on public.documents (tenant_id, lower(code)) where code is not null;
create index documents_tenant_collection_idx on public.documents (tenant_id, collection);

-- ---------------------------------------------------------------------------
-- document_versions
-- ---------------------------------------------------------------------------
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  document_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'rascunho' check (status in ('rascunho', 'em_revisao', 'aprovado', 'obsoleto')),
  storage_path text not null,
  filename text not null check (length(filename) between 1 and 255),
  mime text not null,
  size bigint not null check (size > 0),
  sha256 text not null,
  effective_date date,
  review_date date,
  summary text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  -- Ingestion (worker). 'pending' until the approved version is picked up.
  ingest_status text not null default 'pending' check (ingest_status in ('pending', 'processing', 'ready', 'failed')),
  ingest_error text,
  ingested_at timestamptz,
  chunk_count integer not null default 0,
  -- Set when this version started feeding the AI (ingestion ready). The previous one is obsolete then.
  activated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (document_id, version),
  foreign key (tenant_id, document_id) references public.documents (tenant_id, id) on delete cascade,
  constraint approved_has_approver check (status not in ('aprovado') or approved_at is not null),
  constraint review_after_effective check (review_date is null or effective_date is null or review_date >= effective_date)
);
create index document_versions_doc_idx on public.document_versions (tenant_id, document_id, version desc);
create index document_versions_pending_idx on public.document_versions (tenant_id, ingest_status)
  where status = 'aprovado' and ingest_status <> 'ready';
-- One active (feeding the AI) version per document.
create unique index document_versions_one_active on public.document_versions (document_id)
  where status = 'aprovado' and activated_at is not null;

alter table public.documents
  add constraint documents_current_version_fk foreign key (tenant_id, current_version_id)
  references public.document_versions (tenant_id, id) on delete set null (current_version_id);

-- ---------------------------------------------------------------------------
-- document_chunks (search unit, ADR-0005/0007)
-- ---------------------------------------------------------------------------
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  document_id uuid not null,
  document_version_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  section_path text,
  page integer check (page is null or page > 0),
  content text not null check (length(content) > 0),
  token_count integer not null check (token_count > 0),
  tsv tsvector generated always as (
    to_tsvector('portuguese', app.immutable_unaccent(coalesce(section_path, '') || ' ' || content))
  ) stored,
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (document_version_id, chunk_index),
  foreign key (tenant_id, document_version_id) references public.document_versions (tenant_id, id) on delete cascade,
  foreign key (tenant_id, document_id) references public.documents (tenant_id, id) on delete cascade
);
create index document_chunks_version_idx on public.document_chunks (tenant_id, document_version_id);
create index document_chunks_tsv_idx on public.document_chunks using gin (tsv);
create index document_chunks_embedding_idx on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- The AI audit trail can now point at real chunks (kept if the chunk is later re-ingested away).
alter table public.ai_citations
  add constraint ai_citations_version_fk foreign key (tenant_id, document_version_id)
  references public.document_versions (tenant_id, id) on delete set null (document_version_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.documents
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.document_versions
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.document_chunks
  for each row execute function app.set_updated_at();
create trigger audit after insert or update or delete on public.documents
  for each row execute function app.audit_row_change();
create trigger audit after insert or update or delete on public.document_versions
  for each row execute function app.audit_row_change();
-- Chunks are derived data: not audited row by row.

-- Status workflow (§4.5): rascunho → em_revisao → aprovado → obsoleto (and back to rascunho when
-- review is rejected). The file and version number are immutable once the version leaves rascunho.
create function app.guard_document_version() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'rascunho' and new.status = 'em_revisao')
      or (old.status = 'em_revisao' and new.status in ('aprovado', 'rascunho'))
      or (old.status = 'aprovado' and new.status = 'obsoleto')
      or (old.status = 'rascunho' and new.status = 'obsoleto')
    ) then
      raise exception 'invalid status change: % -> %', old.status, new.status using errcode = '23514';
    end if;
  end if;
  if old.status <> 'rascunho' and (
    new.storage_path is distinct from old.storage_path
    or new.sha256 is distinct from old.sha256
    or new.version is distinct from old.version
  ) then
    raise exception 'the file of a version under review or approved cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_status before update on public.document_versions
  for each row execute function app.guard_document_version();

-- ---------------------------------------------------------------------------
-- Activation (worker, service role): when an approved version is ingested, it replaces the
-- previous one in a single transaction (the previous becomes 'obsoleto').
-- ---------------------------------------------------------------------------
create function public.activate_document_version(p_tenant_id uuid, p_version_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_doc uuid;
begin
  select document_id into v_doc
    from public.document_versions
   where id = p_version_id and tenant_id = p_tenant_id and status = 'aprovado' and ingest_status = 'ready'
   for update;
  if v_doc is null then
    raise exception 'version is not approved and ingested' using errcode = 'P0002';
  end if;

  update public.document_versions
     set status = 'obsoleto'
   where document_id = v_doc and tenant_id = p_tenant_id and id <> p_version_id
     and status = 'aprovado';

  update public.document_versions set activated_at = now() where id = p_version_id;
  update public.documents set current_version_id = p_version_id where id = v_doc and tenant_id = p_tenant_id;
end;
$$;
revoke execute on function public.activate_document_version(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_document_version(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_chunks enable row level security;

create policy documents_select on public.documents for select to authenticated
  using (app.is_member(tenant_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (app.has_role(tenant_id, 'operator'));
create policy documents_update on public.documents for update to authenticated
  using (app.has_role(tenant_id, 'operator'))
  with check (app.has_role(tenant_id, 'operator'));

create policy document_versions_select on public.document_versions for select to authenticated
  using (app.is_member(tenant_id));
create policy document_versions_insert on public.document_versions for insert to authenticated
  with check (app.has_role(tenant_id, 'operator') and status = 'rascunho');
-- Operators edit drafts and send them to review; approving or making obsolete needs quality+
-- (P25: provisional hierarchy). The transitions themselves are validated by the guard trigger.
create policy document_versions_update on public.document_versions for update to authenticated
  using (app.has_role(tenant_id, 'operator'))
  with check (
    app.has_role(tenant_id, 'operator')
    and (status in ('rascunho', 'em_revisao') or app.has_role(tenant_id, 'quality'))
  );

-- Chunks: readable by members (the panel shows the cited passages); only the worker writes.
create policy document_chunks_select on public.document_chunks for select to authenticated
  using (app.is_member(tenant_id));

-- Users do not touch ingestion fields or activation: those are the worker's.
revoke update on public.document_versions from authenticated;
grant update (status, effective_date, review_date, summary, approved_by, approved_at, ingest_status, ingest_error)
  on public.document_versions to authenticated;
revoke delete, truncate on public.documents, public.document_versions from authenticated;
revoke insert, update, delete, truncate on public.document_chunks from anon, authenticated;
revoke all on public.documents, public.document_versions, public.document_chunks from anon;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, members read objects under <tenant>/ (signed URLs). The API uploads.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy documents_read_by_tenant_members on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and app.is_member(app.try_uuid((storage.foldername(name))[1]))
  );
