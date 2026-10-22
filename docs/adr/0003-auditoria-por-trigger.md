# ADR-0003: `audit_log` por trigger no banco

Status: aceita · Data: 2026-10-22

## Contexto

§4.8: toda ação de usuário no painel vai para `audit_log` (quem, o quê, quando, antes/depois), imutável.
Com ADR-0002, escritas podem chegar pela API ou direto pelo PostgREST.

## Decisão

Trigger genérico `app.audit_row_change()` (`after insert or update or delete`) nas tabelas de negócio e
de configuração. Grava `auth.uid()`, ação, tabela, id e `to_jsonb(old)`/`to_jsonb(new)` (com campos
sensíveis removidos, ex.: `access_token_enc`). Não vai em tabelas de alto volume que já são log
(`messages`, `ai_runs`, `ai_tool_calls`, `ai_citations`, `document_chunks`).

`audit_log` não tem policy de insert/update/delete para usuários: só o trigger (security definer) escreve.

## Alternativas

- **Auditoria na API:** perde escritas fora da API e duplica código por rota.
- **pgaudit:** log de servidor, difícil de mostrar no painel por tenant.

## Consequências

- Escritas do worker (sem `auth.uid()`) aparecem com `user_id` nulo = "sistema".
- Custo de escrita extra aceitável nas tabelas de configuração e operação.
