# Nurion Hub

Plataforma multiempresa de IA para saúde. Um núcleo único + quatro módulos:

- **Nurion Log** — entregas de carga sensível com evidência estruturada e alerta de temperatura.
- **Nurion Labs** — preparo de exames, pedido médico, agendamento simples e rastreio de amostras.
- **Nurion Consult** — copiloto regulatório com fonte, não conformidades, auditorias e treinamentos.
- **Nurion ADM Health** — solicitações internas com SLA, contratos com vencimento e painel executivo.

O campo usa só o **WhatsApp**; gestores usam um **painel web white-label**. A IA só responde com base
em documentos aprovados do cliente, sempre com fonte; sem base, passa para um humano.

> Desenvolvido por VozzyUp para a Nurion Hub Health Tech.

## Documentação

| documento | para quê |
| --- | --- |
| [`ESCOPO.md`](ESCOPO.md) | escopo técnico v1.0 — fonte da verdade |
| [`CLAUDE.md`](CLAUDE.md) | regras inegociáveis, convenções e estado atual |
| [`docs/arquitetura.md`](docs/arquitetura.md) | como as peças se ligam, com diagramas |
| [`docs/onboarding.md`](docs/onboarding.md) | ambiente local e tarefas comuns |
| [`docs/api.md`](docs/api.md) | contrato da API |
| [`docs/adr/`](docs/adr/) | decisões de arquitetura |
| [`docs/runbooks/`](docs/runbooks/) | operação e incidentes |
| [`docs/pendencias.md`](docs/pendencias.md) | perguntas de negócio em aberto |
| [`replica/recon.md`](replica/recon.md) | mapa de telas, fluxos, componentes e dados |
| [`replica/architecture.md`](replica/architecture.md) | schema, rotas, filas e ordem de construção |
| [`replica/features.csv`](replica/features.csv) | matriz de funcionalidades (o que está pronto) |

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

Passo a passo do ambiente local: [`docs/onboarding.md`](docs/onboarding.md).

## Andamento

Construção na ordem da seção 11 do escopo. Estado atual no fim do [`CLAUDE.md`](CLAUDE.md).
