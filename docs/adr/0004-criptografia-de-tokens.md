# ADR-0004: Tokens de WhatsApp com AES-256-GCM na aplicação

Status: aceita · Data: 2026-10-22

## Contexto

§4.2 e §10: tokens de terceiros criptografados ("pgcrypto ou chave em env"). CLAUDE.md regra 9: tokens
de cada tenant ficam criptografados no banco.

## Decisão

AES-256-GCM em `packages/shared/crypto`, chave `ENCRYPTION_KEY` (32 bytes em base64) só no ambiente de
api e worker. Formato salvo: `v1.<iv>.<tag>.<ciphertext>` (base64url). O prefixo de versão permite
rotacionar a chave (runbook `rotacao-de-chaves.md`).

## Alternativas

- **pgcrypto:** a chave precisaria trafegar até o banco em cada query (aparece em logs de statement). Rejeitada.
- **Supabase Vault:** bom, mas amarra a criptografia ao banco e complica teste local. Pode substituir depois.

## Consequências

- O token nunca volta ao painel (campo só de escrita); o painel mostra só "configurado" e os 4 últimos dígitos.
- Perder `ENCRYPTION_KEY` = recadastrar tokens. A chave entra no cofre de segredos da operação.
