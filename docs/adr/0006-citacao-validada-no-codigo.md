# ADR-0006: Resposta final por tool `reply` e citação validada no código

Status: aceita · Data: 2026-10-22

## Contexto

Princípio 3 e CLAUDE.md regra 3: sem resposta sem fonte. Pedir no prompt não basta: o modelo pode
responder de memória ou citar uma fonte que não veio da busca.

## Decisão

- O agente encerra o turno chamando a tool `reply` com
  `{ kind: 'informative' | 'operational' | 'clarification', text, chunk_ids }`. Texto solto do modelo
  sem `reply` não é enviado.
- Se `requireCitation` e `kind = 'informative'`, `chunk_ids` não pode ser vazio e todos precisam estar no
  conjunto de chunks que `search_knowledge` devolveu **nesta execução**. Falhou → resposta descartada,
  `handoff_to_human` (motivo `no_citation`), `knowledge_gaps`, `ai_runs.outcome = 'handoff'`.
- A linha `📄 Fonte: <título>, <seção> (v<versão>)` é montada pelo código a partir dos chunks.
- `operational` é para confirmações sobre dados de tools (ex.: "Leitura registrada: 4,2 °C"); `clarification`
  para perguntas ao usuário. Os evals medem uso indevido desses tipos.

## Alternativas

- **Checar citação por regex no texto:** frágil e não prova que a fonte veio da busca.
- **Segundo modelo julgando a resposta:** caro e lento; pode entrar nos evals, não no caminho quente.

## Consequências

- Nunca afrouxar a validação para passar um teste (CLAUDE.md). Teste unitário cobre: sem busca, chunk de
  outra execução, chunk inexistente, kind operacional.
