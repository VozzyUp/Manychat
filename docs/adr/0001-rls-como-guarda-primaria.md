# ADR-0001: RLS como guarda primária; service role só via `withTenant`

Status: aceita · Data: 2026-10-22

## Contexto

O escopo exige que um tenant nunca veja dado de outro (§1.5, §4.1) e que isso seja testado por tabela
(§10). Há três caminhos de acesso ao banco: painel (usuário logado), API (em nome do usuário) e worker
(sistema, sem usuário).

## Decisão

- Toda tabela de negócio tem `tenant_id not null` e RLS ligado. Policies usam `app.is_member(tenant_id)` e
  `app.has_role(tenant_id, papel)`, funções `security definer` com `search_path = ''`.
- Painel e API acessam o banco **com o JWT do usuário**: o Postgres aplica RLS em toda query.
- Worker e webhooks usam service role, mas só por `withTenant(tenantId)`, que injeta o filtro de tenant.
  O cliente service role cru não é exportado de `packages/db`.
- Teste automático em `supabase/tests`: para cada tabela com `tenant_id`, um usuário do tenant A não lê,
  não altera e não apaga linhas do tenant B; e falha se existir tabela em `public` sem RLS.

## Alternativas

- **Checagem só na aplicação** (um `where tenant_id = ?` por query): um esquecimento vaza dados. Rejeitada.
- **Schema por tenant**: isolamento forte, mas migrations ×N e pgvector por schema. Exagero para o volume.
- **Banco por tenant**: caro e operacionalmente pesado. Rejeitada.

## Consequências

- Policies são parte de toda migration (CLAUDE.md, regra 1) e entram em revisão.
- Consultas complexas viram funções SQL `security invoker` (RLS continua valendo).
- O worker depende de disciplina + lint: importar o cliente service role fora de `packages/db` quebra o lint.
