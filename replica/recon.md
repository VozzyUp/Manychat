# Recon map: ManyChat (web)

Escopo: automação de conversas no Instagram, Messenger e WhatsApp (gatilhos, construtor de fluxos, inbox, contatos, disparos). Fora: os outros canais, app mobile, marketplace.
Para: o próprio negócio do usuário, com opção de virar produto.
Data: 2026-10-20

## Limites desta pesquisa

- **O site do ManyChat bloqueia leitura automática** (HTTP 403 em manychat.com, help.manychat.com e na página de termos). Não contornei o bloqueio. Tudo abaixo vem de fontes públicas de terceiros e do fórum oficial indexado em buscas.
- **Termos de uso:** não deu para ler a seção "Prohibited Uses" (403). Antes de usar uma conta própria no ManyChat para estudar o produto, leia essa seção em manychat.com/legal/tos. Até lá, só fontes públicas.
- **Sem capturas de tela de referência.** `replica/screens/` está vazia. As telas abaixo foram inferidas das descrições, com confiança média.
- Preços variam entre fontes (o plano grátis caiu de 1.000 para 25 contatos em março de 2026, segundo uma delas). Confirme na página oficial antes de usar.

## Fontes

| # | fonte | URL | notas |
| --- | --- | --- | --- |
| 1 | review detalhada (6+ anos de uso) | https://chatimize.com/reviews/manychat/ | lista mais completa de blocos, gatilhos, planos |
| 2 | guia Instagram + regras da Meta | https://getkanal.com/blog/manychat-instagram | gatilhos IG, resposta privada, janelas, preços out/2026 |
| 3 | fórum oficial: story reply | https://community.manychat.com/general-q-a-43/instagram-story-reply-automation-shows-0-sends-despite-correct-setup-10592 | like no story não dispara |
| 4 | fórum oficial: resposta a comentário | https://community.manychat.com/general-q-a-43/instagram-replies-on-comments-not-triggering-automation-10443 | só comentário de primeiro nível dispara |
| 5 | fórum oficial: live | https://community.manychat.com/general-q-a-43/manychat-automation-in-livestream-4406 | gatilho funciona em live |
| 6 | anúncio do AI add-on | https://community.manychat.com/product-updates/transform-your-marketing-strategy-with-manychat-ai-the-ultimate-pro-add-on-1554 | AI Step, intenções |
| 7 | preços | https://chatarmin.com/en/blog/manychat-pricing , https://hackceleration.com/labs/manychat-pricing | conflitantes |
| 8 | integrações | https://setsmart.io/blog/manychat-integrations | ~25-30 nativas |
| 9 | API pública (via catálogo) | https://apis.apievangelist.com/store/rest-api-8/ | subscribers, tags, custom fields, flows |
| 10 | termos de uso | https://manychat.com/legal/tos | não lido (403) |

## Core loop

A pessoa comenta uma palavra num post ou manda DM, recebe uma mensagem automática com botão, clica, responde perguntas e vira contato com tags e campos, que depois recebe disparos.

## Telas

| ID | tela | como chegar | propósito | componentes | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Home / Insights | login | contatos por canal e ao longo do tempo | cards de número, gráfico | vazio, com dados |
| S02 | Automações (lista) | menu | listar e organizar fluxos em pastas | tabela, pastas, status ativo, busca | vazio, com dados |
| S03 | Quick Automation (modelo guiado) | S02 → novo | montar comentário→DM em passos sem canvas | wizard, preview do celular | — |
| S04 | Construtor de fluxo (canvas) | S02 → abrir | montar fluxo arrastando e ligando blocos | canvas, blocos, painel lateral, gatilhos no início | rascunho, publicado, erro de validação |
| S05 | Painel de gatilho | S04 → gatilho | configurar palavra-chave / comentário / story | selects, chips de palavras, escopo de post | — |
| S06 | Teste do fluxo | S04 → testar | testar no canal ou no preview | preview | — |
| S07 | Live Chat / Inbox | menu | conversas de todos os canais, assumir conversa | lista de conversas, abas aberto/fechado, chat, painel do contato | sem conversas, não lidas |
| S08 | Contatos | menu | lista, filtros por tag/campo, ações em massa | tabela, filtros, segmentos | vazio, filtrado |
| S09 | Perfil do contato | S08 → contato | tags, campos, histórico, canal | painel | — |
| S10 | Broadcasts | menu | criar e agendar disparo para segmento | editor, público, agendamento, custo WhatsApp | rascunho, agendado, enviado |
| S11 | Sequências | menu | mensagens programadas em série | linha do tempo | — |
| S12 | Regras | menu | se evento então ação | lista de regras | — |
| S13 | Configurações: canais | settings | conectar IG/FB/WhatsApp via login Meta | botões de conexão, status de permissões | conectado, erro de permissão |
| S14 | Configurações: campos, tags, equipe, API | settings | gerenciar campos personalizados, tags, membros, chave API | tabelas | — |
| S15 | Templates | menu | começar de um modelo | galeria | — |
| S16 | Métricas do fluxo | S04 → analytics | envios, entregas, aberturas, cliques por bloco | números sobre os blocos | sem dados |

## Fluxos

```
F01 Comentário vira lead (o fluxo que as pessoas pagam)
    S02 -> S03/S04 -> S05 (comentário, post X, palavra "QUERO") -> publicar
    seguidor comenta -> resposta pública + DM com botão -> clica -> pergunta e-mail -> salva campo + tag
    cliques do dono até publicar: ~6 no Quick Automation
    edge: comentário em resposta não dispara; DM privada só 1 por comentário, até 7 dias;
          like no story não dispara; conta pessoal não conecta

F02 Palavra-chave na DM
    S04 -> S05 (palavra, tipo de match) -> publicar
    edge: várias automações casando a mesma palavra

F03 Atendente assume conversa
    S07 -> abrir conversa -> pausar automação -> responder -> fechar
    edge: fora de 24h só manual por 7 dias; depois disso, só template (WhatsApp)

F04 Disparo para segmento
    S08 (filtro) -> S10 -> escrever -> agendar -> enviar
    edge: só quem está na janela de 24h (IG/FB); WhatsApp exige template pago

F05 Conectar canal
    S13 -> login Meta -> escolher conta/página -> permissões
    edge: permissão de mensagens desligada no IG; token expira
```

## Componentes

| componente | variantes | estados | usado em |
| --- | --- | --- | --- |
| Bloco do canvas | mensagem, condição, ação, atraso, randomizador, IA, iniciar automação | selecionado, erro, sem conexão | S04 |
| Botão de mensagem | resposta, link, chamada | — | S04, preview |
| Seletor de gatilho | palavra, comentário, story, menção, live, ref URL, anúncio | — | S05 |
| Chips de palavras-chave | incluir, excluir | — | S05 |
| Preview do celular | IG, Messenger, WhatsApp | — | S03, S04 |
| Lista de conversas | aberta, fechada, não lida, atribuída | — | S07 |
| Tabela de contatos | com filtros, seleção em massa | vazia | S08 |
| Filtro de público | tag, campo, canal, data | — | S08, S10 |

## Modelo de dados inferido

```
Conta/Workspace  id, nome, plano, membros
                 evidência: planos por bot, equipe, "bot cloning" (fonte 1)   confiança: média
Canal            id, workspace_id, tipo (ig | fb | wa | ...), id externo, token, status permissões
                 evidência: S13, fonte 2                                     confiança: alta
Contato          id, canal(is), nome, username, telefone, email, tags[], campos{}, opt-in, última interação
                 evidência: API pública (subscribers, tags, custom fields), fonte 9   confiança: alta
CampoPersonalizado  id, nome, tipo (texto, número, data, booleano)
                 evidência: API pública "custom fields", "bot fields"         confiança: alta
Tag              id, nome                                                     confiança: alta
Automação        id, nome, pasta, status, gatilhos[], blocos (grafo), versão publicada
                 evidência: S02, S04, "publicado vs salvo" (fórum)            confiança: alta
Gatilho          tipo, filtros (palavras incluir/excluir, posts, match), resposta pública[]
                 evidência: fonte 2                                           confiança: alta
Broadcast        id, mensagem, segmento, agendado_para, status, custo
                 evidência: fonte 1                                           confiança: média
Sequência        id, passos[{atraso, mensagem}]                               confiança: média
Regra            evento, condição, ação                                       confiança: média
Conversa (inbox) contato, status aberta/fechada, atendente, automação pausada
                 evidência: fonte 1 (takeover, auto-assign)                   confiança: média
Evento de análise  bloco, tipo (enviado, entregue, aberto, clicado)           confiança: palpite
```

Relações: Workspace 1-n Canal, Canal 1-n Contato, Contato n-n Tag, Workspace 1-n Automação, Automação 1-n Gatilho.

## Matriz de funcionalidades

Veja `features.csv`. Must: 28, should: 17, could: 15, skip: 3.
A coluna `clone` já reflete o código atual deste repositório (não começa em `no`, porque a primeira versão já existe).

**Paridade atual: 43/100.** 13 de 28 must-haves feitos. Ainda não dá para lançar (15 must-haves faltando).

## Fora do escopo (não dá ou não se deve clonar)

- **Follow to DM:** a Meta libera esse beta conta a conta. Não depende do código.
- **App Store de terceiros e comunidade de criadores:** é a rede deles, não um recurso.
- **Status de parceiro oficial da Meta**, que ajuda na revisão de permissões: é uma relação comercial.
- Marca, textos, ícones e layout exato do ManyChat.

## Tamanho

Telas 16, fluxos 5, entidades 12.
Partes difíceis:
1. **Construtor visual em canvas** (grafo editável, validação, preview por canal).
2. **Revisão da Meta e login OAuth** para Instagram, Messenger e WhatsApp, com as permissões avançadas.
3. **Disparos e templates do WhatsApp** (aprovação de templates, custo por conversa, limites anti-spam).

Tamanho: **L** (um trimestre) para chegar perto em tudo que é must e should. A base atual já cobre o motor.
