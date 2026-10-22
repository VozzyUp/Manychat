# ADR-0002: Painel lê direto do Supabase e escreve pela API

Status: aceita · Data: 2026-10-22

## Contexto

O painel tem ~47 telas, a maioria listas e detalhes. As escritas têm regras (status, papéis, filas,
APIs externas, criptografia). O CLAUDE.md coloca a "API do painel" no Fastify e exige zod em toda entrada.

## Decisão

- **Leitura:** server components do Next.js consultam o Supabase com a sessão do usuário (`@supabase/ssr`).
  RLS garante o isolamento. Sem rota de API para cada lista.
- **Escrita e tudo que tem regra:** `apps/api` em `/v1/...`, com zod, papel mínimo por rota, e o cliente
  Supabase criado com o JWT do usuário (RLS continua valendo). Uploads, transições de status, testes da
  base, exportações e relatórios passam por aqui.
- Invariantes críticas também ficam no banco (constraints e funções SQL), porque o usuário tecnicamente
  pode chamar o PostgREST com o próprio JWT.

## Alternativas

- **Tudo pela API:** dobra o trabalho (uma rota por tela) sem ganho de segurança, já que RLS vale nos dois.
- **Server Actions do Next.js para escrita:** espalharia regra de negócio no app web; webhooks e worker
  precisam da mesma lógica no Node. Rejeitada.

## Consequências

- Policies de escrita por papel precisam existir mesmo com a API na frente.
- Auditoria não pode depender da API → ADR-0003.
