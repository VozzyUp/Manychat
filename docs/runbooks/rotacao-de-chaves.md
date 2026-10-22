# Runbook: rotação de chaves e tokens

## Token de WhatsApp de um tenant (vencido, revogado ou vazado)

1. No Business Manager do cliente: Usuários do sistema → gerar novo token permanente com
   `whatsapp_business_messaging` e `whatsapp_business_management`.
2. Painel → Config → WhatsApp (S21) → editar número → colar o token → "Testar" (passo 1.4).
3. Se vazou: revogar o antigo no Business Manager.
4. Reprocessar `outbound-messages` que falharam com erro 190 (`filas-e-dlq.md`).

## `ENCRYPTION_KEY`

1. Gerar nova chave: `openssl rand -base64 32`.
2. Configurar `ENCRYPTION_KEY` (nova) e `ENCRYPTION_KEY_PREVIOUS` (antiga) na api e no worker; reiniciar.
3. Rodar a recifragem (passo 1.4): `pnpm --filter @nurion/worker crypto:rotate` — lê com a antiga, grava com a nova.
4. Remover `ENCRYPTION_KEY_PREVIOUS` e reiniciar.

**Desfazer:** enquanto `ENCRYPTION_KEY_PREVIOUS` existir, os dois formatos são lidos.

## `WHATSAPP_APP_SECRET`, chaves de API (Anthropic, OpenAI, Groq), Supabase service role

Trocar no provedor, atualizar o env de api e worker, reiniciar. A service role do Supabase só fica em
api e worker — nunca no web.
