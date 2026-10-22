# ADR-0007: Embeddings com 1536 dimensões, provedor por env

Status: aceita · Data: 2026-10-22

## Contexto

§2 deixa o provedor configurável (Voyage AI ou OpenAI). A coluna `vector(N)` precisa de N fixo.

## Decisão

`vector(1536)`, compatível com OpenAI `text-embedding-3-small` (padrão do `.env.example`). Interface
`EmbeddingsProvider` em `packages/core/rag` com implementações OpenAI e Voyage; o provedor precisa
devolver 1536 dimensões (Voyage permite escolher a dimensão em alguns modelos; se não, reindexar com nova
migration). Cada chunk grava `embedding_model`; a busca usa só chunks do modelo configurado.

## Consequências

- Trocar de provedor = job de reindexação + possível migration de dimensão. Documentado no runbook.
