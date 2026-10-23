# Build log

Uma linha por passo de construção (ESCOPO §11): data, situação, o que falta, o que foi mais difícil que o esperado.

| passo | data | situação | entregue | falta / observações |
| --- | --- | --- | --- | --- |
| 1.1 | 2026-10-22 | feito | monorepo pnpm + Turborepo, TS strict, ESLint 10 type-aware com fronteiras entre pacotes e proibição de nome de modelo no código, `check-boundaries`, Vitest, Prettier, CI (GitHub Actions com Postgres do Supabase + Redis), `supabase/config.toml`, `infra/docker-compose.yml` (Redis), esqueletos de web (Next 16), api (Fastify: `/health`, `/ready`) e worker (BullMQ: registro de módulos, `/health`), build de produção com esbuild + `dist/package.json` | Sentry entra junto com o primeiro fluxo real (1.4). Versões fixadas em majors estáveis: TypeScript 5.9 (typescript-eslint ainda não suporta 6+/7), BullMQ 5, Vitest 3. |
| 1.2 | 2026-10-23 | feito | migration `core_tenancy`: partners, partner_members, profiles, tenants, tenant_modules, tenant_members, departments, audit_log; enum `app_role`; funções de acesso em `app` (security definer, search_path vazio); policies por papel; guardas (último owner, campos só do parceiro, módulos só pelo parceiro); trigger de auditoria; `withTenant` como guarda HTTP + `db.system`; tipos gerados; 37 testes (catálogo, isolamento por tabela, papéis), validados com sabotagem de policy | Hierarquia de papéis linear (P25 em pendências). `TG_ARGV` vem nulo sem argumentos — pego pelos testes. |
