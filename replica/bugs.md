# Bugs

Formato da skill replica-test. Só entra o que foi reproduzido.

| ID | severidade | onde | passos | esperado | obtido | status |
| --- | --- | --- | --- | --- | --- | --- |
| B001 | S2 | Segurança da conta (2FA) | ativar 2FA → ler QR → digitar código certo | 2FA ativado | tela continuava pedindo o código: o formulário usava o estado inicial congelado do `useActionState` | corrigido no passo 1.3 (id do fator vai no formulário); coberto por F02-H5 |
| B002 | S4 | todas as telas | abrir qualquer página | sem erros no console | 404 de `/favicon.ico` | corrigido (ícone `app/icon.svg`); coberto por F02-H1 |
| B003 | S3 | marca white-label | cor primária de tom médio (ex.: #808080 escuro) | texto do botão legível | com o "quase preto" do painel o contraste ficava abaixo de 4,5:1 em alguns tons | corrigido (cai para preto puro); teste varre o espaço de cores |
| B004 | S3 | auditoria (trigger) | qualquer alteração em tenants | linha em audit_log | `TG_ARGV` nulo sem argumentos zerava o JSON e falhava o insert | corrigido no passo 1.2; coberto pelos testes de RLS |

## A conferir

- Na primeira execução do e2e, o axe acusou uma violação de contraste em S19 e S20 que não se repetiu em
  12 execuções seguidas. Hipótese: estado deixado por um teste anterior que falhou antes de limpar a marca.
