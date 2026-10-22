# Onboarding: ambiente local e tarefas comuns

Objetivo: em menos de 15 minutos, rodar web + api + worker com banco local e ver os testes passando.

## Pré-requisitos

| ferramenta | versão | para quê |
| --- | --- | --- |
| Node | 22 | tudo |
| pnpm | 10 | monorepo (`corepack enable`) |
| Docker | 24+ | Supabase local e Redis |
| Supabase CLI | 2.x | `supabase start`, migrations, tipos (`pnpm dlx supabase` também funciona) |

## Primeira vez

```bash
git clone git@github.com:VozzyUp/Manychat.git nurion-hub && cd nurion-hub
corepack enable
pnpm install
cp .env.example .env            # preencha o que for usar; ver tabela abaixo
supabase start                  # Postgres + Auth + Storage locais (portas 54321/54322)
docker compose -f infra/docker-compose.yml up -d redis
pnpm db:migrate                 # aplica supabase/migrations
pnpm db:types                   # gera packages/db/src/database.types.ts
pnpm test                       # unidade + RLS
pnpm dev                        # web :3000, api :4000, worker
```

`supabase start` imprime a URL, a anon key e a service role key locais: copie para `SUPABASE_URL`,
`SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no `.env`.

## Variáveis de ambiente

| variável | quem usa | local |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | web, api | saída do `supabase start` |
| `SUPABASE_SERVICE_ROLE_KEY` | api, worker (**nunca** web) | saída do `supabase start` |
| `REDIS_URL` | api, worker | `redis://localhost:6379` |
| `ANTHROPIC_API_KEY`, `LLM_MODEL_*` | worker, api (Testar a base) | sua chave de desenvolvimento |
| `EMBEDDINGS_*` | worker, api | idem |
| `GROQ_API_KEY` | worker | idem |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | api | app Meta de desenvolvimento |
| `CHATWOOT_URL`, `CHATWOOT_API_TOKEN` | worker | Chatwoot local ou de homologação |
| `ENCRYPTION_KEY` | api, worker | `openssl rand -base64 32` |
| `SENTRY_DSN` | todos | vazio desliga |

Sem chaves de IA/WhatsApp o sistema sobe; os testes usam mocks.

## Testar o webhook do WhatsApp localmente

1. Exponha a api: `cloudflared tunnel --url http://localhost:4000` (ou ngrok).
2. No app Meta de desenvolvimento: Webhooks → URL `https://<tunel>/webhooks/whatsapp`, token
   `WHATSAPP_VERIFY_TOKEN`, campo `messages`.
3. Cadastre o número de teste da Meta no painel (Config → WhatsApp) do tenant de seed.

## Tarefas comuns

### Nova migration

```bash
supabase migration new <nome_em_snake_case>
# escreva a tabela COM tenant_id, RLS e policies (ver docs/adr/0001)
pnpm db:migrate && pnpm db:types
# adicione a tabela ao teste de RLS se ela tiver dados de seed próprios
pnpm test --filter @nurion/db
```

Checklist: `tenant_id not null`, índice começando por `tenant_id`, `enable row level security`,
policies de select/insert/update/delete, trigger `set_updated_at`, trigger de auditoria se for tabela de
negócio, tipos regenerados.

### Nova tool de agente

1. Crie em `packages/core/src/tools/` (núcleo) ou `packages/modules/<m>/src/tools/` (módulo).
2. `input` em zod; `run` usa só o `ctx` (que já vem com `withTenant`); `summarize` curto, sem dados pessoais.
3. Teste unitário obrigatório (CLAUDE.md).
4. Se mexer em prompt ou em `search_knowledge`: `pnpm evals` antes do commit.

### Novo agente

`AgentDefinition` no módulo, registrado em `registerModule`. Prompt usa o bloco de guardrails do core
(nunca reescreva os guardrails no módulo). Textos ao usuário no arquivo de mensagens do módulo (pt-BR).

## Regras que mais pegam quem chega

- Nada de nome de modelo no código — só `LLM_MODEL_AGENT`, `LLM_MODEL_FAST`, `LLM_MODEL_VISION`.
- Nada de query no worker sem `withTenant`.
- Módulo não importa módulo.
- Webhook não processa: enfileira e responde.
- Nunca afrouxe a validação de citação para um teste passar.
- Código em inglês; texto para usuário em português do Brasil, no arquivo de mensagens.

## Quem procurar

| assunto | quem |
| --- | --- |
| plataforma, código, deploy | VozzyUp (Fernando) |
| regra de negócio, POPs, cliente final | Nurion Hub Health Tech |
| dúvidas em aberto | [`docs/pendencias.md`](pendencias.md) |
