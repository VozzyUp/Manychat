# Arquitetura do Nurion Hub

Para quem chega no projeto e precisa entender como as peças se ligam. Detalhes de tabelas, rotas e
ordem de construção: [`replica/architecture.md`](../replica/architecture.md). Telas e fluxos:
[`replica/recon.md`](../replica/recon.md). Escopo: [`ESCOPO.md`](../ESCOPO.md).

## Em uma frase

Um núcleo multiempresa recebe mensagens de WhatsApp, decide qual agente de IA atende, e esse agente
só responde com base em documentos aprovados do cliente (com fonte) ou registra evidências estruturadas;
o que ele não sabe vai para um humano. Gestores acompanham tudo num painel white-label.

## Contexto

```mermaid
flowchart LR
  subgraph Campo["Campo (WhatsApp)"]
    M[Motorista]
    P[Paciente]
    E[Equipe]
  end
  subgraph Escritorio["Escritório (navegador)"]
    G[Gestor / Qualidade]
    N[Parceiro Nurion]
  end
  H[Atendente humano]

  M & P & E <--> WA[WhatsApp Cloud API]
  WA <--> NH((Nurion Hub))
  G & N <--> NH
  H <--> CW[Chatwoot] <--> NH
  NH --> AN[Anthropic API]
  NH --> EMB[Embeddings API]
  NH --> GQ[Groq Whisper]
  NH --> SB[(Supabase: Postgres + Storage + Auth)]
```

## Contêineres

```mermaid
flowchart TB
  subgraph VPS["VPS (Docker + Traefik)"]
    WEB["apps/web\nNext.js painel"]
    API["apps/api\nFastify: webhooks + /v1"]
    WK["apps/worker\nBullMQ"]
    R[(Redis)]
  end
  SB[(Supabase\nPostgres + RLS + pgvector\nStorage + Auth)]
  WA[WhatsApp Cloud API]
  CW[Chatwoot]
  AI[Anthropic / Embeddings / Groq]

  WEB -- "leitura com sessão do usuário (RLS)" --> SB
  WEB -- "escrita: /v1 com JWT do usuário" --> API
  API -- "JWT do usuário (RLS)" --> SB
  API -- enfileira --> R
  WA -- webhook --> API
  CW -- webhook --> API
  R --> WK
  WK -- "service role via withTenant()" --> SB
  WK --> WA
  WK --> CW
  WK --> AI
```

Três processos, um banco. O webhook nunca processa: valida, enfileira e responde 200 (< 1 s).
Todo trabalho pesado (IA, mídia, ingestão, relatórios) acontece no worker.

## Pacotes

| pacote | responsabilidade | pode importar |
| --- | --- | --- |
| `packages/shared` | schemas zod, tipos de domínio, utilitários, mensagens pt-BR comuns | nada interno |
| `packages/db` | cliente Supabase (sessão do usuário e service role), tipos gerados, `withTenant` | shared |
| `packages/whatsapp` | cliente Cloud API, parser de webhook, assinatura, templates | shared |
| `packages/core` | motor de agentes, tools do núcleo, RAG, multimodal, auditoria, handoff, registro de módulos | db, whatsapp, shared |
| `packages/modules/{log,labs,consult,adm}` | agentes, tools, jobs e rotas de cada módulo | core, shared |
| `apps/*` | composição: montam o registro com os módulos e expõem HTTP/filas | tudo acima |

Um módulo nunca importa outro (lint quebra o build). Se dois módulos precisam da mesma coisa, ela vai
para o núcleo.

## O loop central: mensagem → resposta com fonte

```mermaid
sequenceDiagram
  autonumber
  participant WA as WhatsApp
  participant API as api /webhooks/whatsapp
  participant Q as Redis (BullMQ)
  participant W as worker
  participant DB as Postgres
  participant ST as Storage
  participant LLM as Anthropic

  WA->>API: POST (X-Hub-Signature-256)
  API->>API: valida assinatura
  API->>Q: inbound-messages (payload bruto)
  API-->>WA: 200
  Q->>W: job inbound
  W->>DB: tenant por phone_number_id, contato, conversa
  W->>DB: insert messages (wamid único) — duplicado? para aqui
  W->>ST: baixa mídia → tenant_id/yyyy/mm/wamid.ext
  W->>Q: conversation-turns (debounce por conversa)
  Q->>W: job turno
  alt handoff aberto
    W->>W: encaminha ao Chatwoot, IA não responde
  else
    W->>W: roteia (kind do contato, default_module, classificador rápido)
    loop até reply ou maxTurns
      W->>LLM: system + histórico + tools
      LLM-->>W: tool_use (ex.: search_knowledge)
      W->>DB: executa tool (withTenant) + ai_tool_calls
    end
    W->>W: valida citação (chunk_ids vieram da busca?)
    alt válida
      W->>Q: outbound-messages (texto + "📄 Fonte: ...")
    else sem fonte
      W->>W: handoff_to_human + knowledge_gaps
    end
    W->>DB: ai_runs, ai_citations
  end
```

## Motor de agentes

- Um agente é dado (`AgentDefinition`), não uma classe: prompt, tools, escopo de coleções,
  `requireCitation`, `maxTurns`.
- A resposta final sai por uma tool `reply` com `kind` e `chunk_ids`. O código valida os `chunk_ids`
  contra o que `search_knowledge` devolveu na mesma execução e monta a linha de fonte. Sem isso, não
  há resposta: há handoff. Ver [ADR-0006](adr/0006-citacao-validada-no-codigo.md).
- Modelos vêm de `LLM_MODEL_AGENT`, `LLM_MODEL_FAST`, `LLM_MODEL_VISION`. Nunca de uma string no código.
- Toda chamada grava `ai_runs`; toda tool, `ai_tool_calls`; toda fonte, `ai_citations`.

## Documentos e RAG

```mermaid
flowchart LR
  U[Upload no painel] --> R[rascunho] --> V[em_revisao] --> A[aprovado]
  A -->|job ingest-document| X[extrair texto\npdf-parse / mammoth / OCR visão]
  X --> S[detectar seções\ntítulos e numeração]
  S --> C[chunks 500–800 tokens\noverlap 80, sem quebrar item]
  C --> E[embeddings]
  E --> DB[(document_chunks\ntsv + vector)]
  A -->|versão anterior| O[obsoleto]
```

Busca híbrida numa função SQL: vetorial (cosseno) + full-text em português, combinadas por RRF, com
limiar. Abaixo do limiar a busca devolve vazio — e vazio obriga o handoff.
Ver [ADR-0005](adr/0005-busca-hibrida-em-sql.md).

## Handoff (Chatwoot no MVP)

```mermaid
sequenceDiagram
  participant W as worker
  participant CW as Chatwoot
  participant A as Atendente
  participant WA as WhatsApp
  W->>CW: cria/atualiza contato + conversa (resumo e histórico)
  W->>WA: "Vou te passar para um atendente"
  Note over W: handoffs.status = open → IA em silêncio
  A->>CW: responde
  CW->>W: webhook message_created (via api)
  W->>WA: envia ao contato
  A->>CW: resolve
  CW->>W: webhook conversation_status_changed
  Note over W: handoffs.status = closed → IA volta
```

## Isolamento por tenant

Três camadas, todas obrigatórias:

1. **Postgres RLS** em toda tabela de negócio: membro do tenant lê; papel mínimo escreve; tabelas de log
   são só leitura para usuários.
2. **`withTenant(tenantId)`** no worker e nos webhooks: o cliente service role só é acessível por esse
   helper, que injeta o filtro de `tenant_id`.
3. **Storage** com caminho `tenant_id/...` e policies por prefixo; arquivos só por URL assinada curta.

Teste automatizado por tabela: usuário do tenant A não lê, altera nem apaga nada do tenant B.
Ver [ADR-0001](adr/0001-rls-como-guarda-primaria.md).

## Segurança e LGPD

| requisito (§10) | como |
| --- | --- |
| dados sensíveis em trânsito e repouso | TLS no Traefik; Supabase criptografa em repouso; tokens de terceiros com AES-256-GCM na aplicação ([ADR-0004](adr/0004-criptografia-de-tokens.md)) |
| buckets privados | buckets `media`, `documents`, `evidences`, `reports`, `branding` privados (logo pode ser público por tenant) |
| consentimento | `consents` antes de qualquer dado pessoal (Labs); agente checa antes de salvar |
| retenção e anonimização | `tenants.settings.retention_days`; job de retenção; `POST /v1/contacts/:id/anonymize` |
| exportação do tenant | job que gera JSON + arquivos num zip no Storage |
| IA sem treino com dados | APIs comerciais (Anthropic, OpenAI, Groq) via API |
| minimização | o contexto do agente só leva o necessário (sem documento do paciente, por exemplo) |
| logs | nunca logar texto de mensagem nem dados pessoais; só ids |

## Decisões (ADRs)

| # | decisão |
| --- | --- |
| [0001](adr/0001-rls-como-guarda-primaria.md) | RLS como guarda primária; service role só via `withTenant` |
| [0002](adr/0002-leitura-direta-escrita-pela-api.md) | Painel lê direto do Supabase e escreve pela API |
| [0003](adr/0003-auditoria-por-trigger.md) | `audit_log` por trigger no banco |
| [0004](adr/0004-criptografia-de-tokens.md) | Tokens de WhatsApp com AES-256-GCM na aplicação |
| [0005](adr/0005-busca-hibrida-em-sql.md) | Busca híbrida com RRF numa função SQL |
| [0006](adr/0006-citacao-validada-no-codigo.md) | Resposta final por tool `reply` e citação validada no código |
| [0007](adr/0007-embeddings-1536.md) | Embeddings 1536 dimensões, provedor por env |
| [0008](adr/0008-turnos-por-conversa.md) | Um turno por conversa por vez (debounce + lock) |

## Requisitos não funcionais → onde são garantidos

| requisito | onde |
| --- | --- |
| webhook < 1 s | `apps/api` não faz I/O além de Redis; teste de latência no CI |
| IA p95 < 15 s (texto), < 25 s (mídia) | `ai_runs.latency_ms`; painel de custo/latência; `maxTurns` |
| retry exponencial + DLQ | opções padrão das filas em `packages/core/queues` |
| backup diário 30 dias + restauração mensal | Supabase PITR/backups + [runbook](runbooks/backup-e-restauracao.md) |
| custo por tenant | `ai_runs.cost_usd`, `usage_daily`, painel do parceiro |
| evals no CI | `evals/<módulo>` + `pnpm evals`; piora bloqueia o merge |
| RLS testado | `supabase/tests` no CI contra Postgres real |
