# CLAUDE.md — Nurion Hub

Plataforma multiempresa de IA para saúde: um núcleo + 4 módulos (Log, Labs, Consult, ADM Health).
**O escopo completo está em `ESCOPO.md`. Leia a seção relevante antes de implementar qualquer coisa.**

## Regras inegociáveis

1. **Isolamento por tenant.** Toda tabela de negócio tem `tenant_id NOT NULL` e RLS habilitado. Toda migration nova inclui policies e um teste de RLS. No worker (service role), use sempre o helper `withTenant(tenantId)`; nunca faça query sem filtro de tenant.
2. **IA no código, não em ferramenta visual.** Nada de n8n. Agentes são `AgentDefinition` em TypeScript, chamando a Anthropic API pelo SDK oficial.
3. **Sem resposta sem fonte.** Agentes com `requireCitation: true` só respondem se citarem um `chunk_id` retornado por `search_knowledge`. Sem base, chamam `handoff_to_human`. Nunca afrouxe essa validação para "fazer o teste passar".
4. **Nada clínico.** A IA nunca dá diagnóstico, avalia sintomas ou orienta fora do POP do cliente.
5. **Modelos por env.** Nunca fixe nome de modelo no código. Use `LLM_MODEL_AGENT`, `LLM_MODEL_FAST`, `LLM_MODEL_VISION`.
6. **Saída de IA sempre validada.** Toda tool de visão/extração retorna JSON validado por zod, com campo `confidence`.
7. **Tudo auditado.** Toda chamada de modelo grava `ai_runs`; toda tool, `ai_tool_calls`; toda fonte usada, `ai_citations`.
8. **Webhooks rápidos.** O webhook valida a assinatura, enfileira e responde 200. Todo processamento acontece no worker.
9. **Segredos só em env.** Tokens de WhatsApp de cada tenant ficam criptografados no banco.
10. **Módulos isolados.** `packages/modules/*` importam de `packages/core`, nunca uns dos outros.

## Stack

pnpm + Turborepo · TypeScript strict · Next.js (App Router) + Tailwind + shadcn/ui · Fastify · BullMQ/Redis · Supabase (Postgres + RLS + pgvector + Storage + Auth) · Anthropic SDK · WhatsApp Cloud API · Whisper (Groq) · Chatwoot (handoff no MVP) · Vitest + Playwright · Docker + Traefik.

## Estrutura

```
apps/web      painel Next.js
apps/api      Fastify (webhooks + API do painel)
apps/worker   BullMQ (mensagens, ingestão, jobs)
packages/core       agentes, RAG, multimodal, auditoria, handoff
packages/db         cliente Supabase, tipos gerados, withTenant
packages/whatsapp   Cloud API, parsing, templates
packages/modules/{log,labs,consult,adm}
packages/shared     schemas zod, utilitários
supabase/migrations
evals/{log,labs,consult,adm}
```

## Convenções

- Idioma do código: inglês (nomes, comentários). Textos para usuário: português do Brasil, num arquivo de mensagens por módulo.
- Banco: `snake_case`, migrations com `supabase migration new <nome>`, tipos regenerados após cada migration.
- Toda entrada externa (webhook, body de API, saída de IA) passa por schema zod em `packages/shared`.
- Erros: nunca engolir; logar com pino incluindo `tenant_id`, `conversation_id` e `job_id`.
- Testes: cada tool de agente tem teste unitário; cada fluxo de módulo tem teste de integração com WhatsApp e Anthropic mockados.
- Evals: mudanças em prompt ou em `search_knowledge` rodam `pnpm evals` antes do commit.

## Comandos

```bash
pnpm install
pnpm dev            # web + api + worker
supabase start      # Postgres/Storage/Auth local
pnpm db:migrate     # aplica migrations
pnpm db:types       # regenera tipos
pnpm test           # vitest
pnpm evals          # avaliações dos agentes
```

## Variáveis de ambiente (.env.example)

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=
LLM_MODEL_AGENT=claude-sonnet-5-5
LLM_MODEL_FAST=claude-haiku-5-5
LLM_MODEL_VISION=claude-sonnet-5-5
EMBEDDINGS_PROVIDER=openai
EMBEDDINGS_API_KEY=
EMBEDDINGS_MODEL=text-embedding-3-small
GROQ_API_KEY=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
CHATWOOT_URL=
CHATWOOT_API_TOKEN=
ENCRYPTION_KEY=
SENTRY_DSN=
```

## Como trabalhar

- Siga a ordem da seção 11 do `ESCOPO.md`. Um passo por vez, com testes, antes do próximo.
- Antes de cada passo: diga o que vai criar ou alterar. Depois: rode os testes e mostre o resultado.
- Dúvida de regra de negócio que não está no `ESCOPO.md`: pergunte, não invente.
- Ao terminar cada passo, atualize a lista "Estado atual" abaixo.

## Estado atual

- [x] Fase 1 · Passo 1 — monorepo, CI e ambiente local
- [x] Fase 1 · Passo 2 — migrations do núcleo, RLS e testes de RLS
- [x] Fase 1 · Passo 3 — auth e painel base: login, troca de tenant, layout white-label
- [x] Fase 1 · Passo 4 — webhook WhatsApp: validação, fila, idempotência, mídia, envio de texto e template
- [x] Fase 1 · Passo 5 — contatos, conversas, mensagens e roteamento
- [x] Fase 1 · Passo 6 — motor de agentes: loop de tool use, `ai_runs`, `ai_tool_calls`, limites
- [x] Fase 1 · Passo 7 — documentos: upload, versões, aprovação, ingestão, chunking, embeddings
- [x] Fase 1 · Passo 8 — `search_knowledge` híbrida + validação de citação + tela "Testar a base"
- [ ] Fase 1 · Passo 9 — multimodal: transcrição de áudio e visão com saída estruturada

Mapa do sistema e plano: `replica/recon.md`, `replica/architecture.md`, `docs/`. Log por passo: `replica/build-log.md`.
