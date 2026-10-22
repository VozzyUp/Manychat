# Runbook: provedor de IA fora (Anthropic, embeddings, Groq)

**Quando usar:** `ai_runs.outcome = 'error'` subindo, latência p95 acima de 15 s, erros 429/5xx/529.

## Comportamento esperado do sistema

- Erro do modelo no turno → retry com backoff (3 tentativas). Esgotou → handoff com motivo `ai_error`
  e mensagem curta ao contato. Ninguém fica sem resposta.
- Embeddings fora → ingestão re-tenta; documentos ficam com `ingest_status = 'failed'` e podem ser
  reprocessados. A busca continua funcionando com o que já foi indexado (a busca precisa de embedding da
  pergunta: sem embeddings, a busca cai só no full-text e o limiar fica mais conservador).
- Groq fora → áudio sem transcrição: o agente pede ao contato para escrever.

## Passos

1. Ver status do provedor (status.anthropic.com, status.openai.com, groqstatus.com).
2. Ver no painel do parceiro (S24) quais tenants estão afetados.
3. Se for limite de taxa da conta (429 constante): reduzir concorrência do worker (`WORKER_CONCURRENCY`)
   e pedir aumento de limite.
4. Se for indisponibilidade longa: avisar a Nurion; handoffs vão crescer no Chatwoot.

## Desfazer

Após normalizar, reprocessar `ingest-document` falhos (`filas-e-dlq.md`).
