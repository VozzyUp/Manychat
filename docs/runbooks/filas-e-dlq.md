# Runbook: filas e dead-letter

**Quando usar:** fila acumulando, alerta do Sentry de job falho, jobs na `dead-letter`.

**Precisa de:** acesso ao Redis e ao worker.

## Diagnóstico

1. Tamanho das filas: `pnpm --filter @nurion/worker ops queues:stats`. Jobs na dead-letter: `pnpm --filter @nurion/worker ops dlq:list`.
2. Jobs falhos: Sentry, filtrando por `job_id` e `queue`. Todo log tem `tenant_id`, `conversation_id`, `job_id`.
3. Causas comuns:
   - `inbound-messages` falhando: mudança no formato do webhook (schema zod reprovou) → ver payload salvo no job.
   - `outbound-messages`: erros permanentes não são re-tentados e a mensagem fica `failed` com o motivo
     em `messages.error` — `outside_window` (fora da janela de 24 h: use template), `recipient` (131026,
     número sem WhatsApp), `invalid_token` (190 → `rotacao-de-chaves.md`), `template` (13200x).
     Limites da Meta (429/130429/131056) e falhas de rede são re-tentados com espera exponencial.
   - `conversation-turns` falhando: provedor de IA → `provedor-de-ia-fora.md`.
   - `ingest-document` falhando: arquivo corrompido ou escaneado sem texto → ver `document_versions.ingest_error`.

## Correção

- Causa corrigida → reprocessar a DLQ: `pnpm --filter @nurion/worker ops dlq:retry --queue <fila>` (sem `--queue`, reprocessa tudo).
- Job que nunca vai passar (payload inválido) → `pnpm --filter @nurion/worker ops dlq:drop --id <id>` e registrar no incidente.

## Desfazer

Reprocessar é seguro: os consumidores são idempotentes (`wamid` único, ingestão apaga chunks antes,
envio de saída grava o `wamid` retornado e não reenvia se já existir).
