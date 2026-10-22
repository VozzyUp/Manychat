# Runbook: backup e restauração

**Requisito (§10):** backup diário com retenção de 30 dias e teste de restauração mensal.

## Backup

- Banco: backups diários do Supabase (plano com retenção ≥ 30 dias, ou PITR). Confirmar em
  Project Settings → Database → Backups.
- Storage: os arquivos não entram no backup do banco. Job semanal copia os buckets para um bucket de
  backup em outro provedor (S3/R2) — configurar na implantação (passo 1.13).
- Redis: não precisa de backup (filas são reprocessáveis; o estado vive no Postgres).

## Teste mensal de restauração

1. Criar um projeto Supabase temporário (ou branch) e restaurar o backup mais recente.
2. Rodar `pnpm db:verify` (passo 1.13) apontando para o restaurado: confere contagem de linhas por tabela
   de um tenant de referência e se o RLS está ligado em todas as tabelas.
3. Abrir o painel apontando para o restaurado e conferir uma conversa e um documento.
4. Registrar data, duração e resultado em `docs/runbooks/registro-restauracao.md`.
5. Apagar o projeto temporário.

## Restauração real (perda de dados)

1. Parar o worker (`docker compose stop worker`) para não gravar sobre o estado restaurado.
2. Restaurar pelo painel do Supabase (PITR para o minuto anterior ao incidente).
3. Subir o worker. Mensagens que chegaram durante a parada ficaram na fila `inbound-messages` e serão
   processadas.
4. Comunicar a Nurion com o intervalo afetado.
