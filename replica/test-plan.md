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
| F04-H1 | roteamento | motorista | motorista cadastrado com 9º dígito escreve sem ele | reconhecido, vai para Log, resposta para o id que o WhatsApp usou | core (turn) | passa |
| F04-H2 | | contato desconhecido sem Labs | número novo escreve | mensagem de identificação, handoff `unidentified`, depois silêncio | core (turn) + worker | passa |
| F04-H3 | | equipe com vários módulos | classificador confiante / em dúvida | roteia / pergunta com lista; escolha fica na sessão | core (router + turn) | passa |
| F04-E1 | | handoff aberto | mensagem com atendimento humano aberto | a IA não responde | core (router) | passa |
| F04-E2 | | estado expirado (§4.10) | `state_expires_at` no passado | estado e módulo esquecidos | core (turn) | passa |
| S04-H1 | conversas | lista e filtros | abrir Conversas; filtrar por atendimento humano e por módulo | conversa com selo do motivo; filtros aplicados; axe ok | e2e | passa |
| S05-H1 | conversa | mensagens | foto, áudio com transcrição, envio que falhou | foto por URL assinada carrega; transcrição; motivo da falha em pt-BR; janela de 24 h | e2e | passa |
| S05-H2 | | encerrar atendimento humano | botão Encerrar | confirmação, handoff `closed` com quem fechou | e2e + API | passa |
| S05-N1 | | leitor | abrir conversa com handoff | vê, sem botão de encerrar | e2e | passa |
| S05-N2 | | outro tenant | id de conversa de outro tenant | 404 nas duas URLs, nada na lista | e2e + RLS | passa |
| S05-M1 | | celular | conversa no Pixel 7 | sem rolagem horizontal, axe ok | e2e (mobile) | passa |
| S06-H1 | contatos | cadastrar | telefone digitado com/sem 9; duplicado; inválido; buscar por nome e número; filtrar por tipo | id canônico, "Já existe…", erro de número, busca e filtro | e2e + API | passa |
| S07-H1 | contato | editar e anonimizar | mudar tipo; anonimizar com confirmação | consentimentos e conversas listados; dados, mensagens e arquivos apagados; auditoria sem dados pessoais | e2e + API + RLS | passa |
| S07-N1 | | leitor | abrir contato | sem formulário e sem anonimizar | e2e | passa |
| F06-H1 | motor de agentes | resposta com fonte | busca → reply informativa com chunk da busca | texto + linha "📄 Fonte" montada pelo código; ai_runs, ai_tool_calls, ai_citations gravados | core (modelo simulado, banco real) | passa |
| F06-N1 | | citação inventada | reply cita chunk que a busca não devolveu | resposta descartada, handoff `no_citation`, nada enviado | core | passa |
| F06-N2 | | informativa sem busca | reply informativa sem chunk_ids | descartada, handoff `no_citation` | core + unidade | passa |
| F06-E1 | | reply junto com busca | as duas na mesma chamada | reply recusada, o modelo vê os resultados e responde de novo | core | passa |
| F06-E2 | | texto solto | modelo responde sem usar reply | uma cobrança; depois handoff `ai_error`; nada enviado | core | passa |
| F06-E3 | | maxTurns | modelo só pede buscas | handoff `max_turns` | core | passa |
| F06-E4 | | erro do modelo / recusa | exceção ou `stop_reason: refusal` | handoff `ai_error`, ai_runs `error` | core | passa |
| F06-E5 | | argumentos inválidos | tool chamada com tipo errado | erro devolvido ao modelo, que se corrige | core | passa |
| F06-E6 | | sem agente | conversa sem definição de agente | handoff `other`, nada de silêncio | core | passa |
| F06-H2 | | classificador da equipe | mensagem de funcionário | módulo + confiança validados; saída inválida → null + ai_runs `error` | core | passa |
| F06-H3 | | fiação no worker | webhook → turno → agente → envio | mensagem enviada e ai_runs com custo | worker (BullMQ real) | passa |
| F05-H1 | ingestão | texto, seções e chunks | POP em TXT com seções numeradas | um chunk por seção com caminho citável; embeddings 1536; resumo; versão ativada | core (banco e Storage reais, embeddings e modelo simulados) | passa |
| F05-H2 | | PDF | PDF com texto | lido por página, chunk com `page` | core | passa |
| F05-E1 | | nova versão | v2 aprovada | v1 vale até v2 ficar pronta; depois v1 vira obsoleta e `current_version_id` muda | core + RLS | passa |
| F05-E2 | | reprocessar | rodar de novo | chunks substituídos, não duplicados | core | passa |
| F05-N1 | | arquivo ruim | PDF escaneado, vazio, sem embeddings configurados | `failed` com mensagem em pt-BR, sem nova tentativa | core | passa |
| F05-E3 | | provedor fora do ar | 503 nos embeddings | tenta de novo; só a última tentativa marca `failed` | core | passa |
| F05-E4 | | resumo falha | modelo devolve lixo | ingestão termina sem resumo | core | passa |
| F05-U1 | | extração e chunking | itens inteiros, sobreposição, parágrafo gigante, DOCX→markdown | respeita 800 tokens e 80 de overlap | unidade | passa |
| F05-U2 | | embeddings | lotes de 64, ordem, 429/5xx, dimensões erradas | tentativas e erros certos | unidade | passa |
| S10-H1 | documento novo | upload | arquivo, metadados, tipo errado | rascunho criado; tipo recusado com mensagem; falha não deixa documento vazio | API + e2e | passa |
| S09-H1 | documento | fluxo de aprovação | operador envia; Qualidade aprova | operador não vê "Aprovar"; aprovar enfileira a ingestão uma vez | API + e2e | passa |
| S09-H2 | | versões | arquivo idêntico; v2; falha e reprocessar | "idêntico" recusado; v1 segue em uso; motivo da falha visível | API + e2e | passa |
| S08-H1 | documentos | lista e filtros | coleção, situação, revisão vencida, busca | selos corretos e filtros aplicados; axe ok | e2e | passa |
| S08-N1 | | leitor | abrir lista e /novo | sem botões de envio | e2e | passa |
| RLS-doc | documentos | isolamento e guardas | outro tenant; saltos de status; arquivo trocado; ativação | nada vaza; transições inválidas barradas | `packages/db/tests` | passa |
| F08-H1 | busca | híbrida | vetor + texto em português, RRF | quem aparece nas duas listas vence; acento e flexão não atrapalham | RLS/DB | passa |
| F08-N1 | | limiar | pergunta fora da base | vazio (força o handoff), mesmo com palavras iguais; limiar ajustável por empresa | DB + core | passa |
| F08-N2 | | filtros | rascunho, em revisão, ainda processando, obsoleta, outra coleção, outro modelo de embeddings, outra empresa | nada disso aparece | DB + core | passa |
| F08-H2 | | agente | search → reply com chunk | citação só aceita chunk desta busca; coleções do agente e empresa certas | core (modelo simulado) | passa |
| F08-N3 | | sem base | busca vazia ou base não configurada | agente chama handoff `no_knowledge`; pergunta vai para S12 | core | passa |
| F08-N4 | | sem fonte | resposta informativa sem busca | descartada, handoff `no_citation`, vai para S12; urgência não vira lacuna | core | passa |
| S11-H1 | testar a base | resposta com fonte | pergunta coberta pela base (modelo e embeddings simulados) | resposta com "📄 Fonte", trecho marcado como usado, custo, `ai_runs`/`ai_citations` | API + e2e | passa |
| S11-N1 | | fora da base | pergunta sem trecho relevante | "Sem resposta", nenhuma fonte inventada | e2e | passa |
| S11-N2 | | papéis | Qualidade abre a tela; sem IA configurada | só gestor+ testa; 503 claro sem configuração | API + e2e | passa |
| S12-H1 | perguntas sem resposta | resolver e reabrir | lista, resolver, reabrir; leitor | só Qualidade+ vê; filtros abertas/resolvidas | API + e2e + RLS | passa |
| F09-H1 | áudio | transcrição | voice note no webhook | texto gravado em `messages.transcription` antes de agendar o turno; `ai_runs` `media.transcription` | core | passa |
| F09-E1 | | provedor fora do ar | 503 do Whisper | job tenta de novo; na última tentativa segue sem texto e a mídia diz o motivo; erro permanente não repete | core | passa |
| F09-E2 | | repetição | webhook repetido / job refeito | só faz o que falta (uma transcrição) | core | passa |
| F09-H2 | PDF recebido | texto | PDF com texto; PDF escaneado | texto guardado; escaneado marcado e não repetido | core | passa |
| F09-H3 | agente | o que o modelo vê | áudio transcrito, imagem, PDF, áudio sem texto | texto; imagem só como `media_id`; PDF como dado; pedido para escrever | core | passa |
| F09-H4 | visão | leitura estruturada | `read_thermometer` de teste | imagem vai ao modelo de visão; saída validada com `confidence`; `ai_runs` `vision.*` | core + unidade | passa |
| F09-N1 | | acesso à mídia | media_id de outra conversa, de áudio, não baixada | recusado; só a legítima chega ao modelo | core | passa |
| F09-N2 | | saída inválida | JSON sem `confidence`, fora do limite, não-JSON | erro para o agente, nunca um chute; schema sem `confidence` nem pode ser definido | unidade + core | passa |
| S05-H3 | conversa no painel | PDF e áudio | PDF com texto lido; áudio sem transcrição | "Texto lido do PDF" e o motivo da falha aparecem | e2e | passa |
