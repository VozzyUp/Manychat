# Arquitetura: Nurion Hub

Plano de engenharia a partir de `replica/recon.md` e do `ESCOPO.md`. IDs de telas (S/L/B/C/A) e
fluxos (F) vêm do recon. Decisões com trade-offs ficam em `docs/adr/`. Visão para leitura rápida,
com diagramas: `docs/arquitetura.md`.

## Stack

Fixada pelo escopo (§2). Aqui só o "porquê" e as escolhas que o escopo deixou em aberto.

| camada | escolha | por quê |
| --- | --- | --- |
| linguagem | TypeScript strict, Node 22 | um idioma do banco ao painel; tipos gerados do schema |
| monorepo | pnpm workspaces + Turborepo | cache de build/test por pacote; regra de dependência entre pacotes explícita |
| painel | Next.js (App Router) + Tailwind + shadcn/ui | server components leem direto do Supabase com a sessão do usuário (RLS) |
| API | Fastify | webhooks rápidos (< 1 s) e API do painel com zod; mesmo processo não faz trabalho pesado |
| filas | BullMQ + Redis | retry exponencial, DLQ, jobs repetíveis (§4.10), deduplicação/debounce por conversa |
| banco | Supabase Postgres (sa-east-1) + RLS + pgvector | isolamento por tenant no banco, busca híbrida no mesmo lugar dos dados |
| arquivos | Supabase Storage, buckets privados | URL assinada curta; policies de Storage por prefixo `tenant_id/` |
| auth | Supabase Auth (e-mail + senha, MFA TOTP opcional) | JWT que o Postgres entende (`auth.uid()`) |
| IA | `@anthropic-ai/sdk`, modelos por env | tool use nativo, visão, prompt caching |
| embeddings | `EMBEDDINGS_PROVIDER` (padrão OpenAI `text-embedding-3-small`, 1536 dims) | dimensão fixada na migration; trocar de provedor = reindexar (ADR-0007) |
| transcrição | Groq Whisper `whisper-large-v3-turbo` (env) | rápido e barato; interface permite trocar |
| WhatsApp | Cloud API oficial | único canal de campo (§1.6) |
| handoff | Chatwoot self-hosted, inbox tipo API por tenant | caixa humana pronta no MVP (§4.7) |
| PDF | `pdf-parse` (ler), `mammoth` (DOCX), `@react-pdf/renderer` (gerar relatórios) | sem navegador headless no worker |
| logs/erros | pino + Sentry | `tenant_id`, `conversation_id`, `job_id` em todo log |
| testes | Vitest + Playwright; RLS testado contra Postgres real | RLS não se testa com mock |
| deploy | Docker + Traefik em VPS, GitHub Actions | três imagens: web, api, worker |

Uma base de dados, três processos (web, api, worker), nenhum microserviço.

## Fronteiras e regras de dependência

```
apps/web ──► packages/shared, packages/db (só tipos e cliente com sessão do usuário)
apps/api ──► packages/core, packages/db, packages/whatsapp, packages/shared, packages/modules/*
apps/worker ──► packages/core, packages/db, packages/whatsapp, packages/shared, packages/modules/*
packages/modules/<m> ──► packages/core, packages/shared (NUNCA outro módulo, NUNCA apps)
packages/core ──► packages/db, packages/whatsapp, packages/shared (NUNCA modules)
packages/whatsapp ──► packages/shared
packages/db ──► packages/shared
```

Imposto por lint (`no-restricted-imports` por pasta) e por `package.json` (dependências declaradas).
Os módulos se registram no core por um registro (`registerModule({ agents, tools, jobs, routes })`);
apps montam o registro com os módulos ativos. O core nunca conhece um módulo pelo nome.

## Acesso a dados

| quem | cliente | guarda |
| --- | --- | --- |
| painel (leitura) | Supabase com a sessão do usuário (cookie, `@supabase/ssr`) | RLS |
| painel (escrita) | `POST/PATCH /v1/...` na API, que usa um cliente Supabase **com o JWT do usuário** | zod + papel na API, RLS no banco |
| worker e webhooks | service role **só via `withTenant(tenantId)`** | filtro explícito de `tenant_id` em toda query |
| testes de RLS | `pg` direto com `set local role authenticated` + `request.jwt.claims` | — |

`withTenant(tenantId)` devolve um cliente Supabase normal (tipagem completa), cujo `fetch` é uma guarda
HTTP (`packages/db/src/tenant-fetch.ts`): acrescenta `tenant_id=eq.<tenant>` em leituras, updates e
deletes, carimba `tenant_id` em inserts/upserts, injeta `p_tenant_id` em RPC, recusa filtro ou linha de
outro tenant, tabelas globais, Auth admin e caminhos de Storage fora de `<tenant>/`. A violação nunca
chega ao banco: vira um 403 local e um log de erro. Consultas que precisam cruzar tenants (resolver o
tenant pelo `phone_number_id`, listar tenants ativos) são funções nomeadas em `db.system`. O cliente
service role cru não sai de `packages/db`, e o lint proíbe `@supabase/supabase-js` fora dele e do web.

Invariantes críticas ficam no banco (funções SQL `security invoker`, constraints), não só na API:
aprovar versão de documento, transições de status de NC, unicidade de `wamid`.

## Schema

Tabelas: **55** (29 núcleo, 9 Log, 7 Labs, 6 Consult, 4 ADM — lista em `recon.md`).
Acesso: **RLS em todas**. Migrations em `supabase/migrations/`, uma por passo de construção.

Convenções de todas as tabelas:

- `id uuid primary key default gen_random_uuid()`, `created_at`/`updated_at timestamptz not null default now()`
  (trigger `set_updated_at`).
- `tenant_id uuid not null references tenants(id) on delete cascade` + índice que começa por `tenant_id`.
- Status como `text` + `check (status in (...))` (evita migração de enum para adicionar valor).
- Tempo sempre `timestamptz` em UTC; fuso do tenant em `tenants.settings.timezone` (padrão `America/Sao_Paulo`).
- Dinheiro: `value_cents bigint` + `currency text` (contratos); custo de IA em `numeric(12,6)` USD.
- FKs para outro registro do mesmo tenant são compostas quando o vazamento entre tenants seria grave
  (ex.: `messages (tenant_id, conversation_id) references conversations (tenant_id, id)`), o que exige
  `unique (tenant_id, id)` nas tabelas-pai.

### Funções de acesso (usadas pelas policies)

```sql
-- papéis em ordem de poder
create type app_role as enum ('viewer','operator','quality','manager','admin','owner');

create function app.is_member(t uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.tenant_members m
                       where m.tenant_id = t and m.user_id = auth.uid()) $$;

create function app.has_role(t uuid, min_role app_role) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.tenant_members m
                       where m.tenant_id = t and m.user_id = auth.uid() and m.role >= min_role) $$;

create function app.is_partner_admin(p uuid) returns boolean ...;   -- painel do parceiro
create function app.module_enabled(t uuid, m text) returns boolean ...;
```

`security definer` evita recursão de RLS em `tenant_members`; `search_path = ''` evita sequestro de
função.

### Policies padrão (geradas por uma função de migration para cada tabela de negócio)

| operação | regra |
| --- | --- |
| select | `app.is_member(tenant_id)` (+ `app.module_enabled` nas tabelas de módulo) |
| insert/update | `app.has_role(tenant_id, 'operator')` — tabelas de config pedem `'admin'`; documentos e NCs pedem `'quality'` para aprovar/encerrar (via função SQL) |
| delete | `app.has_role(tenant_id, 'admin')`; **nenhuma** para tabelas de log |
| tabelas de log (`audit_log`, `ai_runs`, `ai_tool_calls`, `ai_citations`, `messages`) | só select para membros; escrita só pelo service role (§4.8 "logs imutáveis") |

Teste automático: para **cada** tabela com `tenant_id`, um usuário do tenant A não lê, não altera e
não apaga nada do tenant B; e um teste de catálogo falha se existir tabela em `public` sem RLS.

### Índices e restrições que importam

```sql
-- idempotência do WhatsApp (§4.2)
alter table messages add constraint messages_wamid_key unique (wamid);
-- um número de WhatsApp pertence a um só tenant
alter table whatsapp_numbers add constraint wa_phone_number_id_key unique (phone_number_id);
-- contato único por tenant
create unique index on contacts (tenant_id, wa_id);
-- no máximo uma versão aprovada por documento
create unique index one_approved_version on document_versions (document_id) where status = 'aprovado';
-- no máximo um handoff aberto por conversa
create unique index one_open_handoff on handoffs (conversation_id) where status = 'open';
-- busca
create index on document_chunks using hnsw (embedding vector_cosine_ops);
create index on document_chunks using gin (tsv);
create index on document_chunks (tenant_id, document_version_id);
-- painéis
create index on messages (tenant_id, conversation_id, created_at desc);
create index on alerts (tenant_id, status, created_at desc);
create index on nonconformities (tenant_id, status, created_at desc);
create index on ai_runs (tenant_id, created_at desc);
```

### Busca híbrida (§4.5) — função SQL

```sql
create function search_knowledge(
  p_tenant_id uuid, p_query text, p_embedding vector(1536),
  p_collections text[], p_limit int default 6, p_min_score float default <limiar>
) returns table (chunk_id uuid, document_id uuid, document_version_id uuid, version int,
                 title text, code text, section_path text, page int, content text, score float)
```

- Candidatos: top 30 por cosseno (`embedding <=> p_embedding`) e top 30 por `ts_rank_cd(tsv,
  websearch_to_tsquery('portuguese', unaccent(p_query)))`.
- Só chunks de `document_versions.status = 'aprovado'` cujo documento está em `p_collections`.
- RRF: `score = Σ 1/(60 + rank)`; corte por limiar mínimo de similaridade vetorial **e** de RRF;
  abaixo do limiar retorna vazio → o agente é obrigado a fazer handoff.
- Chamada pelo worker com service role passando `p_tenant_id` (dentro de `withTenant`) e pelo painel
  ("Testar a base") via API com o JWT do usuário — a função checa `app.is_member(p_tenant_id)` quando
  `auth.uid()` não é nulo.
- Limiar calibrado pelos evals (`evals/`), guardado em `tenant_modules.settings` com padrão global.

## API

Base: `apps/api` (Fastify). Autenticação do painel: `Authorization: Bearer <jwt do Supabase>` +
`x-tenant-id`. A API confere o JWT, confere o papel mínimo da rota e repassa o JWT ao Supabase (RLS).
Erros: `{ error: { code, message, details? } }` com 400 (zod), 401, 403, 404, 409, 422, 500.

### Webhooks e saúde

| método rota | faz | quem | entrada | saída | fluxo |
| --- | --- | --- | --- | --- | --- |
| GET /webhooks/whatsapp | verificação da Meta (`hub.challenge`) | Meta | query | challenge | F01 |
| POST /webhooks/whatsapp | valida `X-Hub-Signature-256`, enfileira payload bruto em `inbound-messages`, 200 | Meta | corpo bruto | 200 vazio | F03, F07 |
| POST /webhooks/chatwoot/:token | token por tenant na URL; enfileira em `chatwoot-events` | Chatwoot | evento | 200 | F04 |
| GET /health, /ready | vivo / Redis + banco ok | Traefik | — | 200/503 | — |

### Painel — núcleo (`/v1`)

| método rota | faz | papel mínimo | fluxo/tela |
| --- | --- | --- | --- |
| GET /v1/me | perfil, tenants, papéis, módulos ativos, marca | autenticado | F02 S01 S02 |
| PATCH /v1/tenant | nome, marca (valida contraste), regras, horários, fuso | admin | S19 |
| GET/POST/PATCH/DELETE /v1/members | convidar (e-mail do Supabase), mudar papel, remover | admin | S20 |
| POST/PATCH/DELETE /v1/whatsapp-numbers | cadastrar número, cifrar token, `default_module` | admin | F01 S21 |
| POST /v1/whatsapp-numbers/:id/check | testa o token na Graph API | admin | S21 |
| POST/PATCH /v1/whatsapp-templates, POST /v1/whatsapp-templates/sync | templates e sincronização de status com a Meta | admin | S22 |
| POST/PATCH /v1/contacts, POST /v1/contacts/:id/anonymize | contatos, `kind`, LGPD | operator / admin | S06 S07 F13 |
| POST /v1/documents (multipart) | cria documento + versão 1 (rascunho) + arquivo no Storage | manager | F05 S10 |
| POST /v1/documents/:id/versions (multipart) | nova versão (rascunho) | manager | F05 |
| POST /v1/document-versions/:id/transition | `em_revisao` / `aprovado` (quality) / `obsoleto`; aprovar enfileira ingestão | manager/quality | F05 S09 |
| GET /v1/document-versions/:id/file | URL assinada curta | viewer | S09 |
| POST /v1/knowledge/test | "Testar a base": roda o agente escolhido sem WhatsApp | manager | F06 S11 |
| PATCH /v1/knowledge-gaps/:id | marcar lacuna como resolvida | manager | S12 |
| POST/PATCH /v1/nonconformities, POST /v1/nonconformities/:id/transition, POST /v1/nonconformities/:id/actions | NCs e ciclo | operator / quality | F08 S13 S14 |
| POST /v1/evidences (multipart), GET /v1/evidences/:id/file | evidência e URL assinada | operator / viewer | S16 |
| POST /v1/alerts/:id/handle | tratar alerta (ação tomada) | quality | F09 S15 |
| GET /v1/audit/export.csv?kind=&from=&to= | CSV em stream de `audit_log` ou `ai_runs` | manager | F10 S17 |
| POST /v1/reports, GET /v1/reports/:id/file | gera PDF/CSV em job | manager | F11 S18 |
| POST /v1/tenant/export | exportação completa do tenant (job) | owner | F13 |

### Painel do parceiro (`/v1/partner`)

| método rota | faz | quem | tela |
| --- | --- | --- | --- |
| GET /v1/partner/tenants | tenants com uso e custo do mês | partner admin | S24 |
| POST/PATCH /v1/partner/tenants | criar/editar tenant e marca | partner admin | S25 |
| PUT /v1/partner/tenants/:id/modules | ativar/desativar módulos | partner admin | S25 |
| POST /v1/partner/tenants/:id/invite-owner | convite ao owner | partner admin | F01 |

### Módulos (resumo; detalhado no passo de cada fase)

| prefixo | rotas | telas |
| --- | --- | --- |
| /v1/log | CRUD drivers, vehicles, shippers, destinations, cargo-types; POST/PATCH shipments (+ stops); POST shipments/:id/report; GET indicators | L01–L05 |
| /v1/labs | CRUD units, exams, patients; PATCH schedule-requests/:id (confirmar); POST samples, POST samples/:id/events | B01–B06 |
| /v1/consult | POST copilot/messages (chat do painel); CRUD audits + requirements; POST quizzes/generate, PATCH quizzes/:id, POST quizzes/:id/publish, POST quizzes/:id/send; GET/POST /q/:token (público, token) | C01–C05 |
| /v1/adm | CRUD request-types; POST/PATCH requests (+ transition, notifica); POST contracts (upload → extração), PATCH contracts/:id/review; GET executive | A01–A06 |

### Filas e jobs (`apps/worker`)

| fila | produz | consome | tentativas | notas |
| --- | --- | --- | --- | --- |
| `inbound-messages` | webhook WhatsApp | parse → tenant → contato → conversa → `messages` (wamid único) → mídia → agenda turno | 5, exponencial | status de entrega também passam aqui |
| `conversation-turns` | inbound | roda o agente da conversa | 3 | **debounce** 1,5 s por conversa (deduplicação BullMQ) + lock Redis por conversa: nunca dois turnos da mesma conversa ao mesmo tempo |
| `outbound-messages` | agentes, painel, alertas | envia pela Cloud API (janela de 24 h ou template) | 5, exponencial | respeita 429 da Meta |
| `chatwoot-events` | webhook Chatwoot | mensagem do atendente → WhatsApp; resolvido → fecha handoff | 5 | |
| `ingest-document` | aprovação de versão | extrair → seções → chunks → embeddings → resumo | 3 | idempotente: apaga chunks da versão antes |
| `reports` | painel, jobs | gera PDF/CSV → Storage | 3 | |
| `scheduled` (repeatable) | — | diários 06:00 do fuso: vencimentos (docs, contratos), consolidação de custos (`usage_daily`), limpeza de estado; lembretes Labs de hora em hora; relatório semanal ADM seg 07:00 | 3 | §4.10 |
| `dead-letter` | qualquer fila após esgotar tentativas | só guarda + Sentry | — | runbook `docs/runbooks/filas-e-dlq.md` |

Webhooks de saída: nenhum no MVP (o embarcador recebe relatório por e-mail só na ETAPA 2).

## Motor de agentes (§4.4)

```ts
type AgentDefinition = {
  key: string; module: ModuleKey;
  systemPrompt: (ctx: AgentContext) => string;
  tools: ToolDefinition[]; knowledgeScopes: Collection[];
  requireCitation: boolean; maxTurns: number;
};
type ToolDefinition<I, O> = {
  name: string; description: string; input: ZodType<I>;
  run: (input: I, ctx: ToolContext) => Promise<O>;   // ctx traz tenant (withTenant), conversa, contato
  summarize: (output: O) => string;                   // vai para ai_tool_calls.result_summary
};
```

Garantia "sem resposta sem fonte" (CLAUDE.md regra 3), em código, não só no prompt:

1. O agente **não** devolve texto livre: a resposta final sai por uma tool terminal `reply`
   `{ kind: 'informative' | 'operational' | 'clarification', text, chunk_ids: string[] }`.
2. Se `requireCitation` e `kind = 'informative'`: `chunk_ids` não vazio **e** todo `chunk_id` precisa
   ter vindo de um `search_knowledge` **desta** execução. Senão: descarta, `handoff_to_human`
   (motivo `no_citation`), grava `knowledge_gaps`.
3. A linha `📄 Fonte: <título>, <seção> (v<versão>)` é montada pelo código a partir dos chunks
   citados — o modelo não escreve a fonte.
4. `maxTurns` atingido, erro da API ou saída inválida → handoff com motivo, `ai_runs.outcome`.
5. Evals medem uso indevido de `operational` para fugir da citação.

Custos: tabela de preços por modelo em env (`LLM_PRICING`, JSON), nunca no código; `cost_usd` por
`ai_run`; prompt caching (`cache_control`) no system prompt e nas definições de tools.

## As partes que mordem

- **Fuso horário:** tudo em UTC; "conversas do dia", lembretes 24–48 h e jobs diários usam o fuso do tenant.
- **Idempotência:** `wamid` único (insert `on conflict do nothing`); status de entrega podem chegar antes da
  mensagem existir (guarda e reaplica); jobs com `jobId` determinístico; ingestão apaga chunks da versão antes.
- **Concorrência:** rajada de mensagens do mesmo contato → debounce + lock por conversa; duas aprovações
  simultâneas → índice parcial "uma aprovada por documento" + função SQL transacional.
- **Janela de 24 h:** `conversations.last_inbound_at`; fora da janela só template; erro 131047 da Meta tratado.
- **Mídia:** URL da Meta expira em minutos — baixar no `inbound-messages`, não no turno; limite de tamanho;
  MIME validado; caminho `tenant_id/yyyy/mm/wamid.ext`.
- **Rate limits:** Meta (por número e 429), Anthropic (429/529 com retry e backoff), Groq.
- **Busca em português:** `unaccent` + config `portuguese`; números de item ("5.2.3") preservados no chunk.
- **Embeddings:** dimensão fixa (1536); `embedding_model` gravado por chunk; trocar provedor = reindexar.
- **Multi-tenancy:** RLS + `withTenant` + policies de Storage por prefixo `tenant_id/`; teste por tabela.
- **LGPD:** anonimização apaga nome, mídia e texto das mensagens, mantém métricas; consentimento antes de
  dados pessoais (Labs); minimização no que vai para a IA (só o necessário à tarefa).
- **Injeção de prompt:** texto de documentos e de usuários entra como dado (`tool_result`), nunca como
  instrução; tools com efeito (NC, alerta, template) validam argumentos com zod e permissões do contato.
- **Custo:** `maxTurns`, `max_tokens`, modelo rápido no roteamento, alerta de custo diário por tenant.
- **Realtime:** não no MVP; painel recarrega por intervalo nas telas de alertas.

## Ordem de construção (§11)

A fatia vertical é o próprio loop F03 — passos 4 a 8 juntos já respondem uma pergunta no WhatsApp com fonte.

| passo | entrega | telas | tabelas | rotas/filas |
| --- | --- | --- | --- | --- |
| 1.1 | monorepo, lint, CI, docker-compose local (Supabase CLI + Redis), esqueleto dos apps | — | — | /health |
| 1.2 | migrations do núcleo (multiempresa) + RLS + testes de RLS | — | partners, partner_members, profiles, tenants, tenant_modules, tenant_members, departments | — |
| 1.3 | auth e painel base: login, troca de tenant, white-label, tokens de design | S01 S02 S03 (casca) S19 S20 S23 | — | /v1/me, /v1/tenant, /v1/members |
| 1.4 | webhook WhatsApp, fila, idempotência, mídia, envio texto/template, números e templates | S21 S22 | whatsapp_numbers, whatsapp_templates, messages, message_media | /webhooks/whatsapp, inbound-messages, outbound-messages |
| 1.5 | contatos, conversas, mensagens e roteamento | S04 S05 S06 S07 | contacts, consents, conversations, handoffs | conversation-turns |
| 1.6 | motor de agentes: loop, `ai_runs`, `ai_tool_calls`, limites, custos | S05 (painel IA) | ai_runs, ai_tool_calls, usage_daily | — |
| 1.7 | documentos: upload, versões, aprovação, ingestão, chunking, embeddings | S08 S09 S10 | documents, document_versions, document_chunks | /v1/documents…, ingest-document |
| 1.8 | `search_knowledge` híbrida + validação de citação + Testar a base | S11 S12 | ai_citations, knowledge_gaps | /v1/knowledge/test |
| 1.9 | multimodal: Whisper e visão com zod | S05 (transcrição) | — | — |
| 1.10 | handoff Chatwoot ida e volta | — | — | /webhooks/chatwoot, chatwoot-events |
| 1.11 | auditoria, NCs, evidências, alertas | S13–S17 S03 | audit_log, nonconformities, nc_actions, evidences, alerts | /v1/nonconformities…, /v1/alerts…, /v1/audit… |
| 1.12 | módulo Log completo + relatórios + parceiro | L01–L05 S18 S24 S25 | tabelas do Log, reports | /v1/log…, reports |
| 1.13 | evals do Log + homologação | — | — | `pnpm evals` no CI |
| 2 | Labs | B01–B06 | tabelas do Labs | /v1/labs… |
| 3 | Consult | C01–C05 | tabelas do Consult | /v1/consult… |
| 4 | ADM Health | A01–A06 | tabelas do ADM | /v1/adm… |

Riscos principais: (1) qualidade da visão em fotos reais de termômetro (depende das fotos do cliente,
§13); (2) aprovação de templates e acesso ao Business Manager do cliente (bloqueia testes ponta a ponta);
(3) calibração do limiar de relevância sem base real de POPs. Próximo passo: design (tokens white-label)
dentro do passo 1.3 e build a partir do passo 1.1.
