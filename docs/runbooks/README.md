# Runbooks

Procedimentos de operação. Cada um diz quando usar, o que precisa, os passos, como desfazer e a quem escalar.
Comandos marcados com "(passo 1.x)" passam a existir quando aquele passo de construção estiver pronto;
até lá, o runbook é o plano.

| runbook | quando |
| --- | --- |
| [webhook-whatsapp.md](webhook-whatsapp.md) | mensagens não chegam, chegam atrasadas ou em dobro |
| [filas-e-dlq.md](filas-e-dlq.md) | fila crescendo, jobs na dead-letter |
| [provedor-de-ia-fora.md](provedor-de-ia-fora.md) | Anthropic, embeddings ou Groq com erro/lentidão |
| [chatwoot-fora.md](chatwoot-fora.md) | handoff não abre ou atendente não consegue responder |
| [rotacao-de-chaves.md](rotacao-de-chaves.md) | token de WhatsApp vencido/vazado, troca de `ENCRYPTION_KEY` |
| [backup-e-restauracao.md](backup-e-restauracao.md) | teste mensal de restauração ou perda de dados |

Escalação padrão: 1) VozzyUp (Fernando) — plataforma; 2) Nurion — contato com o cliente final;
3) suporte do provedor (Meta, Supabase, Anthropic) com o id da requisição em mãos.
