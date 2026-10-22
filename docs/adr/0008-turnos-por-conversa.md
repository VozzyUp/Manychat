# ADR-0008: Um turno por conversa por vez (debounce + lock)

Status: aceita · Data: 2026-10-22

## Contexto

No WhatsApp a pessoa manda várias mensagens seguidas (texto + foto + áudio). Processar cada uma como um
turno separado gera respostas duplicadas e corridas no `conversation_state`. BullMQ (open source) não
tem filas por grupo.

## Decisão

- `inbound-messages` grava a mensagem e agenda `conversation-turns` com deduplicação por `conversation_id`
  e atraso de ~1,5 s (debounce): rajadas viram um turno.
- O processador do turno pega um lock Redis por conversa; se ocupado, reagenda. O turno processa todas as
  mensagens de entrada ainda não processadas da conversa, em ordem.
- `conversation_state` é atualizado no fim do turno numa única escrita.

## Consequências

- Latência mínima de ~1,5 s por turno (cabe no p95 de 15 s).
- Ordem garantida por conversa; paralelismo entre conversas.
