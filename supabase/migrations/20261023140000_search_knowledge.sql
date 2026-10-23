-- Build step 1.8 — hybrid search (ADR-0005) and unanswered questions (ESCOPO §4.5).
--
-- search_knowledge: vector (cosine) + Portuguese full-text, fused by RRF, filtered by tenant,
-- agent collections and "approved and active version". Below the similarity floor it returns
-- nothing, and nothing forces the handoff (rule 3). Service role only: the worker passes the tenant.

create function public.search_knowledge(
  p_tenant_id uuid,
  p_query text,
  p_embedding extensions.vector(1536),
  p_embedding_model text,
  p_collections text[],
  p_limit integer default 6,
  p_min_similarity double precision default 0.3,
  p_min_score double precision default 0
) returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  version integer,
  title text,
  code text,
  collection text,
  section_path text,
  page integer,
  content text,
  similarity double precision,
  score double precision
)
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
declare
  v_words text;
  v_tsquery tsquery;
begin
  -- Natural questions: OR of the meaningful words (stop words are dropped by the dictionary).
  v_words := nullif(trim(regexp_replace(lower(app.immutable_unaccent(coalesce(p_query, ''))), '[^a-z0-9]+', ' ', 'g')), '');
  if v_words is not null then
    v_tsquery := to_tsquery('portuguese', replace(v_words, ' ', ' | '));
  end if;

  return query
  with eligible as (
    select c.id, c.document_id, c.document_version_id, v.version, d.title, d.code, d.collection,
           c.section_path, c.page, c.content, c.tsv, c.embedding
      from public.document_chunks c
      join public.document_versions v
        on v.id = c.document_version_id and v.tenant_id = c.tenant_id
      join public.documents d
        on d.id = c.document_id and d.tenant_id = c.tenant_id
     where c.tenant_id = p_tenant_id
       and v.status = 'aprovado'
       and v.activated_at is not null
       and c.embedding_model = p_embedding_model
       and d.collection = any (p_collections)
  ),
  vec as (
    select e.id, 1 - (e.embedding operator(extensions.<=>) p_embedding) as sim,
           row_number() over (order by e.embedding operator(extensions.<=>) p_embedding) as rnk
      from eligible e
     order by e.embedding operator(extensions.<=>) p_embedding
     limit 30
  ),
  fts as (
    select e.id, row_number() over (order by ts_rank_cd(e.tsv, v_tsquery) desc, e.id) as rnk
      from eligible e
     where v_tsquery is not null and e.tsv @@ v_tsquery
     order by ts_rank_cd(e.tsv, v_tsquery) desc, e.id
     limit 30
  ),
  fused as (
    select coalesce(vec.id, fts.id) as id,
           (coalesce(1.0 / (60 + vec.rnk), 0) + coalesce(1.0 / (60 + fts.rnk), 0))::double precision as score
      from vec
      full outer join fts on fts.id = vec.id
  )
  select e.id, e.document_id, e.document_version_id, e.version, e.title, e.code, e.collection,
         e.section_path, e.page, e.content,
         1 - (e.embedding operator(extensions.<=>) p_embedding) as similarity,
         f.score
    from fused f
    join eligible e on e.id = f.id
   where 1 - (e.embedding operator(extensions.<=>) p_embedding) >= p_min_similarity
     and f.score >= p_min_score
   order by f.score desc, e.id
   limit least(greatest(p_limit, 1), 20);
end;
$$;

revoke execute on function public.search_knowledge(uuid, text, extensions.vector, text, text[], integer, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.search_knowledge(uuid, text, extensions.vector, text, text[], integer, double precision, double precision)
  to service_role;

-- ---------------------------------------------------------------------------
-- Unanswered questions: what fell into a handoff for lack of base (S12), so the team
-- can complete the documentation.
-- ---------------------------------------------------------------------------
create table public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid,
  agent_key text,
  question text not null check (length(question) between 1 and 1000),
  reason text not null check (reason in ('no_knowledge', 'no_citation')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  constraint resolved_has_time check (status = 'open' or resolved_at is not null)
);
create index knowledge_gaps_tenant_status_idx on public.knowledge_gaps (tenant_id, status, created_at desc);

create trigger set_updated_at before update on public.knowledge_gaps
  for each row execute function app.set_updated_at();
create trigger audit after insert or update or delete on public.knowledge_gaps
  for each row execute function app.audit_row_change();

alter table public.knowledge_gaps enable row level security;
create policy knowledge_gaps_select on public.knowledge_gaps for select to authenticated
  using (app.has_role(tenant_id, 'quality'));
create policy knowledge_gaps_update on public.knowledge_gaps for update to authenticated
  using (app.has_role(tenant_id, 'quality'))
  with check (app.has_role(tenant_id, 'quality'));
-- The worker records them; people only mark them resolved.
revoke insert, delete, truncate on public.knowledge_gaps from anon, authenticated;
revoke update on public.knowledge_gaps from authenticated;
grant update (status, resolved_by, resolved_at) on public.knowledge_gaps to authenticated;
revoke all on public.knowledge_gaps from anon;
