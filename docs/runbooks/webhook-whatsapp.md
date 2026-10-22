# Runbook: webhook do WhatsApp

**Quando usar:** contatos dizem que mandaram mensagem e não tiveram resposta; mensagens duplicadas;
alerta de latência do webhook.

**Precisa de:** acesso ao Meta App (Business Manager do cliente), logs da api (pino), Redis, painel.

## Diagnóstico

1. **A Meta está entregando?** Meta App → WhatsApp → Configuração → Webhooks: URL
   `https://<dominio-api>/webhooks/whatsapp`, campo `messages` assinado. Veja erros de entrega recentes.
2. **A api está respondendo 200?** `curl -s https://<dominio-api>/health` deve dar 200.
   Nos logs da api, procure `webhook.whatsapp` com `status != 200`.
   - `401 invalid_signature`: `WHATSAPP_APP_SECRET` diferente do app secret do app Meta. Corrija o env e reinicie a api.
   - `GET` de verificação falhando: `WHATSAPP_VERIFY_TOKEN` diferente do configurado na Meta.
3. **A fila está andando?** Veja `filas-e-dlq.md`. Fila `inbound-messages` crescendo = worker parado ou lento.
4. **O tenant foi resolvido?** Log `inbound.unknown_phone_number_id` = número não cadastrado em
   Config → WhatsApp (S21) do tenant certo.
5. **Duplicadas:** `messages.wamid` é único; duplicata no WhatsApp do contato indica reenvio do nosso lado.
   Procure o mesmo `conversation_id` com dois `ai_runs` no mesmo segundo e veja o lock de turno (ADR-0008).

## Correção

- Env errado → corrigir e reiniciar a api (`docker compose up -d api`).
- Worker parado → `docker compose up -d worker`; os jobs pendentes processam sozinhos.
- Mensagens perdidas por assinatura errada não voltam: a Meta re-tenta por algumas horas; depois disso,
  avise a Nurion para contatar os afetados.

## Desfazer

Nada a desfazer: o webhook só enfileira.
