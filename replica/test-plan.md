# Plano de testes: Nurion Hub

Casos numerados por fluxo do `recon.md` (H = caminho feliz, E = borda, N = negativo). `auto` diz onde o caso
está automatizado. Cresce a cada passo de construção.

| caso | fluxo | tipo | passos | esperado | auto | resultado |
| --- | --- | --- | --- | --- | --- | --- |
| F02-H1 | login e troca de tenant | feliz | login com 2 tenants → escolher | casca com a marca, navegação, sem erros no console, axe sem violação séria | e2e `auth.spec` | passa |
| F02-N1 | | negativo: senha errada | login com senha errada | "E-mail ou senha incorretos.", continua no login | e2e | passa |
| F02-E1 | | borda: link direto | abrir /t/…/config/modulos sem sessão | login e volta ao link | e2e | passa |
| F02-H2 | | feliz: trocar tenant | seletor no cabeçalho | vai para o outro tenant | e2e | passa |
| F02-E2 | | borda: tenant alheio | abrir slug de outro tenant | 404, nada vaza | e2e + API | passa |
| F02-H3 | | sair | menu → Sair | sessão encerrada, páginas pedem login | e2e | passa |
| F02-H4 | | esqueci a senha | pedir link → e-mail → nova senha | e-mail em pt-BR, regra de senha, entra no painel | e2e | passa |
| F02-H5 | | 2FA | ativar com QR/TOTP → sair → entrar | pede código; código errado recusado; URL direta não pula o 2FA | e2e | passa |
| F02-N2 | | 2FA por API/banco | sessão só com senha de quem tem 2FA | nada visível (RLS), API 403 | RLS + API | passa |
| F01-H2 | convite | feliz | owner convida → e-mail → criar senha | pessoa entra no tenant | e2e | passa |
| S19-H1 | marca | feliz | trocar cor e nome | painel recolorido, contraste ≥ 4,5:1 | e2e + API | passa |
| S19-N1 | | negativo | cor inválida | mensagem "Cor inválida" | e2e + API | passa |
| S19-H2 | | logo | enviar PNG, remover | logo aparece/some; SVG e PNG falso recusados; > 1 MB → 413 | e2e + API | passa |
| S19-E1 | | leitor | abrir configurações | somente leitura, sem botão salvar | e2e | passa |
| S20-H1 | equipe | feliz | mudar papel, remover | mensagens e lista atualizadas | e2e + API | passa |
| S20-N1 | | último owner | rebaixar o único owner | "pelo menos um responsável" | e2e + API + RLS | passa |
| S23-H1 | setores | feliz | criar, renomear, excluir | lista atualizada | e2e + API | passa |
| S03-M1 | celular | 390 px | abrir menu | menu abre, sem rolagem horizontal | e2e (Pixel 7) | passa |
| RLS-* | isolamento | todas as tabelas | dono do tenant A contra dados de B | nada lido/alterado/criado | `packages/db/tests` | passa |
| F03-H1 | mensagem recebida | feliz | webhook assinado → fila → worker | contato, conversa e mensagem gravados | API + core + worker (BullMQ real) | passa |
| F03-E1 | | webhook repetido | mesmo corpo duas vezes | um job (jobId), uma mensagem (wamid) | API + core | passa |
| F03-E2 | | assinatura errada | corpo com HMAC de outro segredo | 401, nada na fila | API | passa |
| F03-E3 | | número desconhecido | phone_number_id não cadastrado | ignorado com log, nada gravado | core | passa |
| F03-E4 | | mídia expirada/fora | download falha | mensagem salva, mídia `failed`, job re-tenta e conclui | core | passa |
| F03-E5 | | status antes da mensagem | "sent" de wamid desconhecido | re-tenta 3 vezes e desiste | core | passa |
| F07-H1 | template fora da janela | feliz | conversa há 25 h, enviar template | enviado | core | passa |
| F07-N1 | | texto fora da janela | conversa há 25 h, enviar texto | `failed: outside_window`, Meta não é chamada | core | passa |
| F07-N2 | | erro permanente da Meta | 131026 | sem nova tentativa, dead-letter, mensagem `failed` | core + worker | passa |
| S21-H1 | números | feliz | conectar número, testar, desativar | token validado, nunca exibido | e2e + API | passa |
| S21-N1 | | token recusado | token inválido | mensagem citando a Meta | e2e + API | passa |
| S22-H1 | templates | sincronizar | botão sincronizar | status de aprovação da Meta | e2e + API | passa |
