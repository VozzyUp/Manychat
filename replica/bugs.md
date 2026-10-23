# Bugs

Formato da skill replica-test. Só entra o que foi reproduzido.

| ID | severidade | onde | passos | esperado | obtido | status |
| --- | --- | --- | --- | --- | --- | --- |
| B001 | S2 | Segurança da conta (2FA) | ativar 2FA → ler QR → digitar código certo | 2FA ativado | tela continuava pedindo o código: o formulário usava o estado inicial congelado do `useActionState` | corrigido no passo 1.3 (id do fator vai no formulário); coberto por F02-H5 |
| B002 | S4 | todas as telas | abrir qualquer página | sem erros no console | 404 de `/favicon.ico` | corrigido (ícone `app/icon.svg`); coberto por F02-H1 |
| B003 | S3 | marca white-label | cor primária de tom médio (ex.: #808080 escuro) | texto do botão legível | com o "quase preto" do painel o contraste ficava abaixo de 4,5:1 em alguns tons | corrigido (cai para preto puro); teste varre o espaço de cores |
| B004 | S3 | auditoria (trigger) | qualquer alteração em tenants | linha em audit_log | `TG_ARGV` nulo sem argumentos zerava o JSON e falhava o insert | corrigido no passo 1.2; coberto pelos testes de RLS |

| B005 | S1 (evitado) | modelo de dados | excluir um número de WhatsApp com conversas | bloquear | a FK em cascata apagaria todo o histórico de conversas | corrigido antes de subir (FK `no action`); API devolve 409 e o painel sugere desativar |
| B006 | S2 | migration de templates | aplicar a migration | sucesso | `{1,512}` em regex excede o limite do Postgres (255) | corrigido; pego pelo teste de isolamento |
| B007 | S2 | `record_inbound_message` | gravar mensagem | sucesso | coluna de saída `contact_id` ambígua no PL/pgSQL | corrigido (`#variable_conflict use_column`); pego pelos testes do canal |
| B008 | S3 | S06 cadastro de contato | digitar `12345678x` | "número inválido" | letras eram descartadas e sobravam 8 dígitos aceitos | corrigido (entrada só com dígitos e separadores); teste de unidade e e2e |
| B009 | S3 | S05 e S07 | encerrar atendimento humano / anonimizar | confirmação visível | o cartão com o formulário some depois da ação e levava a mensagem junto | corrigido (redireciona com a confirmação na página); coberto por S05-H2 e S07-H1 |
| B010 | S4 | S04 e S06 | abrir a lista | linhas de ponta a ponta | `p-0` não vencia o `p-5` do Card (sem tailwind-merge) | corrigido (`Card flush`) |

## A conferir

- Na primeira execução do e2e, o axe acusou uma violação de contraste em S19 e S20 que não se repetiu em
  12 execuções seguidas. Hipótese: estado deixado por um teste anterior que falhou antes de limpar a marca.
