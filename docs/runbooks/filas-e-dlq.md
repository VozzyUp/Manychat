# Runbook: filas e dead-letter

**Quando usar:** fila acumulando, alerta do Sentry de job falho, jobs na `dead-letter`.

**Precisa de:** acesso ao Redis e ao worker.

## Diagnóstico

1. Tamanho das filas (passo 1.4): `pnpm --filter @nurion/worker queues:stats`.
2. Jobs falhos: Sentry, filtrando por `job_id` e `queue`. Todo log tem `tenant_id`, `conversation_id`, `job_id`.
3. Causas comuns:
   - `inbound-messages` falhando: mudança no formato do webhook (schema zod reprovou) → ver payload salvo no job.
   - `outbound-messages` falhando: 131047 (fora da janela de 24 h, precisa template), 131026 (número sem
     WhatsApp), 190 (token inválido → `rotacao-de-chaves.md`), 429 (limite da Meta, espera e re-tenta).
   - `conversation-turns` falhando: provedor de IA → `provedor-de-ia-fora.md`.
   - `ingest-document` falhando: arquivo corrompido ou escaneado sem texto → ver `document_versions.ingest_error`.

## Correção

- Causa corrigida → reprocessar a DLQ (passo 1.4): `pnpm --filter @nurion/worker dlq:retry --queue <fila>`.
- Job que nunca vai passar (payload inválido) → `dlq:drop --id <job_id>` e registrar no incidente.

## Desfazer

Reprocessar é seguro: os consumidores são idempotentes (`wamid` único, ingestão apaga chunks antes,
envio de saída grava o `wamid` retornado e não reenvia se já existir).
