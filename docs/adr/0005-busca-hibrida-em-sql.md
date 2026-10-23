# ADR-0005: Busca híbrida com RRF numa função SQL

Status: aceita · Data: 2026-10-22

## Contexto

§4.5: busca vetorial (pgvector, cosseno) + full-text em português, combinadas por RRF, filtrada por
tenant, coleções do agente e status aprovado, top 6 com limiar mínimo (vazio força handoff).

## Decisão

Uma função `search_knowledge(...)` no Postgres faz as duas buscas (top 30 cada), funde por RRF
(`1/(60 + rank)`) e aplica dois cortes: similaridade vetorial mínima e score RRF mínimo. Índices HNSW
(`vector_cosine_ops`) e GIN (`tsv`). `tsv` gerado com `to_tsvector('portuguese', unaccent(...))` a partir
de título + seção + conteúdo. Os limiares ficam em configuração (padrão global, ajuste por tenant) e são
calibrados pelos evals.

## Alternativas

- **Banco vetorial separado** (Pinecone, Qdrant): mais um serviço, sincronização e isolamento por tenant
  fora do RLS. Rejeitada.
- **Fusão no Node:** duas idas ao banco e lógica de filtro duplicada.

## Consequências

- Uma ida ao banco por busca; o filtro de tenant e status mora junto da busca.
- Mudança de limiar ou de RRF roda `pnpm evals` antes do commit (CLAUDE.md).

## Situação (passo 1.8)

Implementado em `public.search_knowledge`. A pergunta vira uma consulta OR das palavras úteis (sem acento; o
dicionário português tira as palavras vazias). O corte é pela similaridade vetorial mínima (padrão 0,3, ajustável por
empresa em `settings.rag.min_similarity`); o corte por score RRF existe como parâmetro (padrão 0). Falta calibrar com os
evals (P31).
