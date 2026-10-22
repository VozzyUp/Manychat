# Runbook: Chatwoot fora

**Quando usar:** handoff não cria conversa no Chatwoot; respostas do atendente não chegam ao WhatsApp;
conversa resolvida e a IA não volta.

## Diagnóstico

1. Chatwoot no ar? `curl -s $CHATWOOT_URL/api` (ou abrir o painel do Chatwoot).
2. Token: `CHATWOOT_API_TOKEN` válido e com acesso à conta do tenant
   (`tenants.settings.chatwoot.account_id`, `inbox_id`).
3. Webhook do Chatwoot (conta → Integrações → Webhooks) apontando para
   `https://<dominio-api>/webhooks/chatwoot/<token-do-tenant>` com eventos `message_created` e
   `conversation_status_changed`.
4. Fila `chatwoot-events` andando (`filas-e-dlq.md`).

## Comportamento esperado com o Chatwoot fora

O handoff fica `open` no Nurion e o contato recebe "vou te passar para um atendente". A criação no
Chatwoot re-tenta. Mensagens do contato durante o handoff ficam gravadas e são enviadas ao Chatwoot quando
ele voltar.

## Correção manual de handoff preso

Se uma conversa ficou com handoff aberto sem atendimento: painel → Conversa (S05) → "Encerrar atendimento
humano" (passo 1.10). A IA volta a responder.
