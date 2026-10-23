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
pnpm db:start                   # Supabase local: Postgres, Auth, REST, Storage e e-mail (Mailpit :54324)
pnpm env:local                  # cria/atualiza o .env com as chaves locais do Supabase
docker compose -f infra/docker-compose.yml up -d redis   # ou um redis-server local
pnpm db:reset                   # recria o banco: migrations + seed com dados de demonstração
pnpm test                       # unidade + RLS + API contra o Supabase local
pnpm dev                        # web :3000, api :4000, worker
pnpm e2e                        # painel no navegador (Playwright), com web e api subindo sozinhos
```

### Usuários de demonstração (só local, criados pelo `supabase/seed.sql`)

Senha de todos: `NurionDemo!2026`.

| e-mail | acesso |
| --- | --- |
| `gestor@demo.local` | owner da Transportadora Demo e admin do Laboratório Demo (vê o seletor de empresa) |
| `qualidade@demo.local` | Qualidade na Transportadora Demo |
| `leitor@demo.local` | leitor na Transportadora Demo |
| `laboratorio@demo.local` | owner do Laboratório Demo |
| `parceiro@nurion.local` | administrador do parceiro Nurion |

Convites e "esqueci minha senha" chegam no Mailpit local: http://127.0.0.1:54324.

Em produção, os modelos de e-mail de `supabase/templates/` precisam ser copiados para o projeto do Supabase
(Authentication → Email Templates), com o link `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`.

## Variáveis de ambiente

| variável | quem usa | local |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | web (só no servidor), api | `pnpm env:local` |
| `SUPABASE_SERVICE_ROLE_KEY` | api, worker (**nunca** web) | `pnpm env:local` |
| `API_URL`, `WEB_URL` | web, api | `http://localhost:4000`, `http://localhost:3000` |
| `REDIS_URL` | api, worker | `redis://localhost:6379` |
| `ANTHROPIC_API_KEY`, `LLM_MODEL_*` | worker, api (Testar a base) | sua chave de desenvolvimento |
| `EMBEDDINGS_*` | worker, api | idem |
| `GROQ_API_KEY` | worker | idem |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | api | `pnpm env:local` gera valores locais; para receber mensagens reais, use os do app Meta de desenvolvimento |
| `WHATSAPP_GRAPH_VERSION` | api, worker | `v23.0` |
| `QUEUE_PREFIX` | api, worker | `nurion` |
| `CHATWOOT_URL`, `CHATWOOT_API_TOKEN` | worker | Chatwoot local ou de homologação |
| `ENCRYPTION_KEY` | api, worker | `pnpm env:local` gera; em produção `openssl rand -base64 32` no cofre |
| `SENTRY_DSN` | todos | vazio desliga |

Sem chaves de IA/WhatsApp o sistema sobe; os testes usam mocks.

Testes no navegador: o Playwright usa o Chromium que ele instala (`pnpm --filter @nurion/web exec playwright
install chromium`) ou um já existente em `PW_CHROMIUM_PATH`.

## Testar o webhook do WhatsApp localmente

1. Exponha a api: `cloudflared tunnel --url http://localhost:4000` (ou ngrok).
2. No app Meta de desenvolvimento: Webhooks → URL `https://<tunel>/webhooks/whatsapp`, token
   `WHATSAPP_VERIFY_TOKEN`, campo `messages`.
3. Cadastre o número de teste da Meta no painel (Config → WhatsApp) do tenant de seed.

## Operação local das filas

```bash
pnpm --filter @nurion/worker ops queues:stats     # tamanho de cada fila
pnpm --filter @nurion/worker ops dlq:list         # jobs que falharam de vez
pnpm --filter @nurion/worker ops dlq:retry        # reprocessar a dead-letter
```

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
