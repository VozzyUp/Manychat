# Mapa do sistema: Nurion Hub (web + WhatsApp)

Escopo: plataforma completa (núcleo + Log, Labs, Consult, ADM Health), MVP de cada módulo; itens [ETAPA 2] mapeados mas fora do build.
Para: Nurion Hub Health Tech (parceiro que revende) e seus clientes finais de saúde.
Data: 2026-10-22

> Este não é um clone de um app existente. O "recon" aqui é o mapeamento do `ESCOPO.md` v1.0
> no formato das skills Replica: telas, fluxos, componentes, modelo de dados e matriz de
> funcionalidades. Os IDs (S/L/B/C/A para telas, F para fluxos) são estáveis e usados em
> `architecture.md`, `features.csv`, nos testes e nos commits.

## Fontes

| # | fonte | onde | notas |
| --- | --- | --- | --- |
| 1 | Escopo técnico v1.0 | `ESCOPO.md` | fonte da verdade; a seção citada vai entre parênteses (§4.2) |
| 2 | Regras de engenharia | `CLAUDE.md` | regras inegociáveis, stack e convenções |
| 3 | WhatsApp Cloud API | developers.facebook.com/docs/whatsapp/cloud-api | webhooks, mídia, templates, janela de 24 h |
| 4 | Anthropic API | docs.anthropic.com | tool use, visão, prompt caching |
| 5 | Supabase | supabase.com/docs | Auth, RLS, Storage, pgvector |
| 6 | Chatwoot API | developers.chatwoot.com | Application API (contatos, conversas, mensagens) e webhooks |

Marcação de confiança no modelo de dados: **escopo** (está escrito no ESCOPO), **inferido**
(necessário para cumprir o escopo, não está escrito) e **pendente** (depende de resposta da
Nurion, ver `docs/pendencias.md`).

## Core loop

Uma pessoa do campo manda uma mensagem (texto, áudio ou foto) no WhatsApp; a plataforma
identifica o tenant e o contato, roteia para o agente do módulo certo, que responde só com base
em documentos aprovados (com fonte) ou registra a evidência estruturada — e quando não há base,
passa para um humano. Tudo fica auditado e aparece no painel do gestor.

## Atores

| ator | canal | o que faz |
| --- | --- | --- |
| Motorista (`driver`) | WhatsApp | inicia rota, checklist, fotos de termômetro, ocorrências, entrega |
| Paciente (`patient`/`unknown`) | WhatsApp | consentimento, dúvidas de preparo, pedido médico, agendamento |
| Equipe (`staff`) | WhatsApp e painel | copiloto, NCs, eventos de amostra, solicitações internas |
| Gestor do tenant (owner/admin/manager) | painel | cadastros, documentos, aprovação, relatórios |
| Qualidade (`quality`) | painel + alertas WhatsApp | trata alertas e NCs, auditorias, treinamentos |
| Operador (`operator`) | painel | opera entregas, amostras, solicitações |
| Leitor (`viewer`) | painel | só leitura |
| Atendente humano | Chatwoot (MVP) | assume conversas em handoff |
| Parceiro Nurion | painel do parceiro | cria tenants, ativa módulos, vê uso e custo |

## Telas do painel (web)

Prefixos: **S** núcleo, **L** Log, **B** Labs, **C** Consult, **A** ADM. Toda tela tem os estados
vazio, carregando, com dados, erro e sem permissão; abaixo só os estados específicos.

### Núcleo

| ID | tela | rota | propósito | componentes | estados específicos |
| --- | --- | --- | --- | --- | --- |
| S01 | Login | `/login` | entrar com e-mail + senha; 2FA opcional (§2) | form, campo de código TOTP | senha errada, 2FA pedido, conta sem tenant |
| S02 | Escolher tenant | `/tenants` | usuário com vários tenants escolhe um (§4.1) | lista de cards com logo | um tenant (pula a tela) |
| S03 | Início do tenant | `/t/[slug]` | conversas do dia, handoffs abertos, alertas abertos, NCs abertas, consumo de IA e WhatsApp no mês (§4.9) | KPI cards, listas curtas | tenant novo sem dados |
| S04 | Conversas | `/t/[slug]/conversas` | lista de conversas com filtro por módulo, agente, status de handoff | tabela, filtros | — |
| S05 | Conversa | `/t/[slug]/conversas/[id]` | mensagens com mídia e transcrição (§4.6), execuções da IA, tools e fontes citadas (§4.8) | bolhas, player de áudio, miniaturas, painel de auditoria da IA | handoff aberto, mensagem falhou |
| S06 | Contatos | `/t/[slug]/contatos` | lista e cadastro de contatos e `kind` (§4.3) | tabela, filtros por kind, form | — |
| S07 | Contato | `/t/[slug]/contatos/[id]` | perfil, consentimentos, conversas, anonimizar (§10) | abas, ação destrutiva com confirmação | contato anonimizado |
| S08 | Documentos | `/t/[slug]/documentos` | lista com filtros por coleção, status, vencimento (§4.5) | tabela, filtros, badge de status | revisão vencida |
| S09 | Documento | `/t/[slug]/documentos/[id]` | metadados, versões, aprovar/obsoletar, resumo, status da ingestão | linha de versões, botões de fluxo de status | ingestão em andamento, falhou |
| S10 | Novo documento / nova versão | `/t/[slug]/documentos/novo` | upload PDF/DOCX/TXT/MD com metadados (§4.5) | upload, form | arquivo grande, tipo inválido |
| S11 | Testar a base | `/t/[slug]/documentos/testar` | pergunta → resposta + trechos usados (§4.5) | campo, resposta, cards de citação | sem base (mostraria handoff) |
| S12 | Perguntas sem resposta | `/t/[slug]/documentos/lacunas` | perguntas que caíram em handoff por falta de base (§4.5) | tabela agrupada, marcar resolvida | — |
| S13 | Não conformidades | `/t/[slug]/ncs` | lista unificada com origem (Log, Labs, Consult) (§7.2) | tabela, filtros, badge de gravidade | — |
| S14 | NC | `/t/[slug]/ncs/[id]` | ciclo aberta → em_tratamento → verificacao → encerrada, ações, evidências | stepper de status, ações, evidências | rascunho criado pela IA |
| S15 | Alertas | `/t/[slug]/alertas` | alertas abertos e tratamento (quem, ação) (§5.3) | tabela, drawer de tratamento | — |
| S16 | Evidências | `/t/[slug]/evidencias` | busca de evidência por entidade, período, texto (§7.3) | busca, galeria | — |
| S17 | Auditoria | `/t/[slug]/auditoria` | `audit_log` e `ai_runs`, exportação CSV por período (§4.8) | tabela, filtro de período, export | — |
| S18 | Relatórios | `/t/[slug]/relatorios` | gerar PDF/CSV por período e módulo (§4.9) | form, lista de relatórios gerados | gerando, pronto, falhou |
| S19 | Config: geral e marca | `/t/[slug]/config` | nome, regras, horários, logo, cores (white-label, §1.7) | form, upload de logo, prévia de cores | contraste insuficiente |
| S20 | Config: membros | `/t/[slug]/config/membros` | convidar, papéis (§4.1) | tabela, convite por e-mail | convite pendente |
| S21 | Config: WhatsApp | `/t/[slug]/config/whatsapp` | números, `default_module`, token (§4.2) | form com campo secreto | token inválido |
| S22 | Config: templates | `/t/[slug]/config/templates` | templates com categoria e status de aprovação (§4.2) | tabela, form | pendente, aprovado, rejeitado |
| S23 | Config: módulos e setores | `/t/[slug]/config/modulos` | módulos ativos (só leitura para o tenant), setores (§4.1, §8.1) | toggles (parceiro), lista de setores | módulo não contratado |
| S24 | Parceiro: tenants | `/parceiro` | todos os tenants, uso e custo por tenant (§4.9) | tabela, KPIs | — |
| S25 | Parceiro: tenant | `/parceiro/tenants/[id]` | criar/editar tenant, ativar módulos, convidar owner | form, toggles | — |

### Log

| ID | tela | rota | propósito | componentes | estados específicos |
| --- | --- | --- | --- | --- | --- |
| L01 | Entregas | `/t/[slug]/log/entregas` | lista com status, filtros por data, motorista, embarcador (§5.3) | tabela, badges, filtro de período | com desvio |
| L02 | Entrega | `/t/[slug]/log/entregas/[id]` | paradas, linha do tempo de eventos (foto, valor, hora, localização), leituras, botão relatório PDF (§5.3) | timeline, mapa por link, miniaturas | em andamento, entregue, com alerta |
| L03 | Nova entrega | `/t/[slug]/log/entregas/nova` | motorista, veículo, tipo de carga, origem, destinos, janela (§5.1) | form com paradas dinâmicas | motorista sem WhatsApp |
| L04 | Cadastros do Log | `/t/[slug]/log/cadastros` | abas: motoristas, veículos, embarcadores, destinos, tipos de carga (faixa, tolerância, POP) (§5.1) | abas, tabelas, forms | — |
| L05 | Indicadores do Log | `/t/[slug]/log/indicadores` | entregas no período, % com desvio, tempo médio de tratamento de alerta (§5.3) | KPI cards, período | — |

### Labs

| ID | tela | rota | propósito | componentes | estados específicos |
| --- | --- | --- | --- | --- | --- |
| B01 | Painel do Labs | `/t/[slug]/labs` | conversas, dúvidas mais frequentes, perguntas sem base, agendamentos pendentes (§6.4) | KPIs, listas | — |
| B02 | Solicitações de agendamento | `/t/[slug]/labs/agendamentos` | recepção confirma a solicitação e registra data (§6.2.4) | tabela, drawer com pedido médico lido | pendente, confirmada, cancelada |
| B03 | Exames e unidades | `/t/[slug]/labs/cadastros` | catálogo de exames (sinônimos, preparo, duração, unidade) e unidades (endereço, horário, link de agendamento) (§6.1) | abas, tabelas, forms | exame sem documento de preparo |
| B04 | Pacientes | `/t/[slug]/labs/pacientes` | lista e detalhe com consentimento LGPD (§6.1) | tabela, detalhe | sem consentimento |
| B05 | Amostras | `/t/[slug]/labs/amostras` | por status; paradas há mais de X horas (§6.3, §6.4) | tabela, filtro "paradas" | — |
| B06 | Amostra | `/t/[slug]/labs/amostras/[id]` | linha do tempo (coleta, envio, recebimento, análise, liberação), registrar evento | timeline, form de evento | — |

### Consult

| ID | tela | rota | propósito | componentes | estados específicos |
| --- | --- | --- | --- | --- | --- |
| C01 | Copiloto | `/t/[slug]/consult/copiloto` | chat no painel com POPs e normas, com fonte (§7.1) | chat, cards de citação, anexar foto | sem base → handoff |
| C02 | Auditorias | `/t/[slug]/consult/auditorias` | lista e detalhe: tipo, data, escopo, requisitos e evidências (§7.3) | tabela, detalhe com requisitos | — |
| C03 | Treinamentos | `/t/[slug]/consult/treinamentos` | gerar quiz de documento aprovado, revisar, publicar, enviar (§7.4) | lista, editor de questões | rascunho, publicado |
| C04 | Quiz | `/t/[slug]/consult/treinamentos/[id]` | tentativas, notas, pendentes (§7.4) | tabela | — |
| C05 | Responder quiz (link) | `/q/[token]` | colaborador responde pelo link (§7.4) | form de múltipla escolha | link expirado, já respondido |

### ADM Health

| ID | tela | rota | propósito | componentes | estados específicos |
| --- | --- | --- | --- | --- | --- |
| A01 | Solicitações | `/t/[slug]/adm/solicitacoes` | por setor e status, SLA (§8.1) | tabela/kanban, badge de SLA | SLA estourado |
| A02 | Solicitação | `/t/[slug]/adm/solicitacoes/[id]` | dados, histórico, mudar status (notifica solicitante) | timeline, form | — |
| A03 | Tipos e SLAs | `/t/[slug]/adm/tipos` | tipos de solicitação por setor, campos obrigatórios, SLA (§8.1) | tabela, editor de campos | — |
| A04 | Contratos | `/t/[slug]/adm/contratos` | lista com vigência e vencimento (§8.2) | tabela, badge de vencimento | a vencer, vencido |
| A05 | Contrato | `/t/[slug]/adm/contratos/[id]` | upload → extração → revisão humana obrigatória (§8.2) | form pré-preenchido com confiança por campo | extraindo, aguardando revisão |
| A06 | Painel executivo | `/t/[slug]/adm/executivo` | solicitações por setor, SLA cumprido, contratos a vencer, NCs abertas (§8.4) | KPIs, período | — |

**Total: 25 telas do núcleo + 5 Log + 6 Labs + 5 Consult + 6 ADM = 47 telas.**

## Conversas no WhatsApp (o "app" do campo)

O WhatsApp não tem telas, tem estados de conversa. Cada agente guarda o estado do seu fluxo em
`conversations.state` (JSON por módulo, §4.4).

| agente | `agent_key` | módulo | quem fala | escopo de base | cita? |
| --- | --- | --- | --- | --- | --- |
| Motorista | `log.driver` | log | driver | `pop` | sim (orientação) |
| Paciente | `labs.patient` | labs | patient/unknown | `preparo_exame`, `faq` | sim |
| Equipe do laboratório | `labs.staff` | labs | staff (amostras) | — | não (registro) |
| Copiloto | `consult.copilot` | consult | staff | `pop`, `manual`, `norma`, `politica` | sim |
| Solicitações | `adm.requests` | adm | staff | `politica`, `contrato` por setor | sim (informativas) |
| Classificador | `router.staff` | núcleo | staff | — | — (LLM_MODEL_FAST) |

## Fluxos

```
F01 Parceiro cria tenant e coloca no ar  (§4.1, §4.2)
    S24 -> S25 (nome, slug, marca, módulos) -> convite ao owner -> S21 (número WhatsApp + token) -> S22 templates
    happy path: 4 telas
    edge: slug duplicado; token inválido; número já usado por outro tenant; owner já é usuário de outro tenant

F02 Login e troca de tenant  (§4.1)
    S01 -> (S02 se >1 tenant) -> S03 ; troca pelo seletor no cabeçalho
    edge: senha errada; 2FA; usuário sem tenant; tenant suspenso; módulo desativado some do menu

F03 Mensagem recebida → resposta com fonte  (§4.2–4.5) — o loop central
    WhatsApp -> POST /webhooks/whatsapp (assinatura, 200, fila inbound-messages)
    -> worker: idempotência por wamid -> tenant por phone_number_id -> contato -> mídia p/ Storage
    -> handoff aberto? (sim: encaminha ao Chatwoot e para) -> roteamento -> agente
    -> loop de tool use (search_knowledge...) -> validação de citação -> envio -> ai_runs/ai_tool_calls/ai_citations
    edge: webhook repetido; status (sent/delivered/read/failed) sem mensagem; número desconhecido;
          fora da janela de 24 h (só template); maxTurns atingido; API da Anthropic fora; mídia expirada

F04 Sem base → humano → volta para a IA  (§4.4, §4.7)
    busca vazia ou resposta sem chunk_id -> handoff_to_human -> Chatwoot (contato + conversa + resumo)
    -> atendente responde no Chatwoot -> webhook Chatwoot -> WhatsApp
    -> atendente resolve -> handoff closed -> IA volta
    edge: Chatwoot fora; contato escreve durante o handoff (vai ao Chatwoot, não à IA); resolver sem responder

F05 Documento do upload à busca  (§4.5)
    S10 upload -> rascunho -> em_revisao -> aprovado (S09) -> job ingest-document
    -> extrair (pdf-parse/mammoth/OCR visão) -> seções -> chunks 500–800 tokens, overlap 80 -> embeddings -> resumo
    -> nova versão aprovada torna a anterior obsoleta
    edge: PDF escaneado; DOCX com tabelas; arquivo vazio; falha de embeddings (retry); aprovar versão ainda ingerindo

F06 Testar a base  (§4.5)
    S11 pergunta -> mesma busca e mesmo agente, sem WhatsApp -> resposta + trechos
    edge: sem base -> mostra "cairia em handoff"

F07 Mensagem fora da janela / alerta por template  (§4.2)
    send_template (aprovado) -> Cloud API -> status por webhook
    edge: template não aprovado; parâmetro faltando; número sem WhatsApp

F08 Não conformidade  (§7.2)
    IA (Log/Consult) ou S13 -> rascunho/aberta -> notifica Qualidade -> em_tratamento (ação, responsável, prazo)
    -> verificacao -> encerrada
    edge: NC aberta pela IA em rascunho precisa de confirmação; prazo vencido

F09 Alerta  (§5.2, §4.10)
    evento fora da regra -> alert (severidade) -> template à Qualidade -> S15 tratar (quem, ação)
    edge: alerta duplicado para a mesma leitura; Qualidade sem WhatsApp

F10 Auditoria e exportação  (§4.8)
    S17 período -> CSV
    edge: período grande (stream); usuário viewer

F11 Relatório PDF/CSV  (§4.9)
    S18 módulo + período -> job -> Storage -> URL assinada

F12 Jobs agendados  (§4.10)
    diário: vencimentos (documentos, contratos), consolidação de custos, limpeza de estado; semanal: relatórios

F13 LGPD  (§10)
    S07 anonimizar contato; S19/S25 exportar tenant (JSON + arquivos)

F20 Motorista inicia rota  (§5.2.1)
    template de rota do dia OU "iniciar" -> IA confirma a entrega ativa
    edge: nenhuma entrega hoje; duas entregas ativas; motorista não cadastrado

F21 Checklist por áudio  (§5.2.2)
    áudio -> Whisper -> extração estruturada -> pede o que faltou -> shipment_event checklist
    edge: áudio inaudível; item dito como "não"; checklist parcial em várias mensagens

F22 Leitura de temperatura  (§5.2.3)
    foto -> read_thermometer {value, unit, confidence, legible}
    -> confidence < 0.8 ou ilegível: pede nova foto
    -> dentro da faixa: registra leitura (+ pede localização)
    -> fora da faixa: alert + template à Qualidade (motorista, operação, temperatura, link do Maps, foto) + NC rascunho
       + orientação só do POP de desvio (search_knowledge, com fonte)
    meta: alerta em < 30 s após a foto
    edge: °F; valor negativo; foto de outra coisa; sem POP de desvio aprovado (handoff)

F23 Ocorrência  (§5.2.4)
    áudio/texto -> categoria (atraso, avaria, lacre violado...) -> NC com evidências

F24 Entrega  (§5.2.5–6)
    foto do comprovante + carga -> extração (recebedor, data/hora) -> localização -> fecha a parada
    edge: comprovante ilegível; última parada fecha a entrega

F25 Gestor acompanha e gera relatório  (§5.3)
    L01 -> L02 -> relatório PDF para o embarcador

F30 Paciente: boas-vindas e consentimento  (§6.2.1)
    primeiro contato -> aviso de privacidade (botões aceito/não aceito) -> consents
    edge: não aceita (só informação geral); revoga depois

F31 Dúvida de preparo  (§6.2.2)
    pergunta -> search_knowledge(preparo_exame) -> resposta com fonte | handoff

F32 Pedido médico → agendamento  (§6.2.3–4)
    foto -> read_medical_order -> confirma lista com o paciente -> unidade -> link de agendamento ou solicitação (B02)
    edge: exame não identificado -> handoff; sem consentimento -> não salva dados pessoais

F33 Lembrete  (§6.2.5)
    job: data registrada -> template 24–48 h antes com preparo

F34 Sintoma grave  (§6.2.6)
    detector de sintoma/urgência -> resposta padrão "procure atendimento" + handoff (sem avaliar)

F35 Evento de amostra  (§6.3)
    staff "amostra 12345 recebida" -> sample_event | B06 registra no painel

F40 Copiloto  (§7.1)
    pergunta (WhatsApp/C01) -> search_knowledge(pop, manual, norma, politica) -> resposta com referência

F41 Foto contra norma  (§7.1)
    foto + pedido -> busca da norma -> visão com os trechos -> pontos observados + referência + "apoio à inspeção, não laudo"

F42 NC por áudio  (§7.2)
    áudio -> {titulo, descricao, local, setor, gravidade, evidencias} -> confirma -> registra -> notifica Qualidade

F43 Auditoria e evidências  (§7.3)
    C02 cria auditoria e requisitos -> vincula evidências -> busca por requisito

F44 Quiz  (§7.4)
    C03 escolhe documento aprovado -> gera 5–10 questões -> revisa -> publica -> WhatsApp (interativo) ou C05
    -> tentativas e notas (C04)

F50 Solicitação interna  (§8.1)
    staff no WhatsApp -> classifica setor e tipo -> coleta campos obrigatórios -> registra com SLA -> atualizações
    edge: tipo ambíguo (pergunta); setor não configurado

F51 "Como está minha solicitação?"  (§8.1)

F52 Contrato  (§8.2)
    A05 upload -> extração -> revisão humana -> salva -> alertas 90/60/30 dias

F53 Pergunta sobre contrato  (§8.2)
    copiloto -> search_knowledge(contrato) -> resposta com cláusula

F54 Relatório semanal ADM  (§8.4)
```

## Componentes

| componente | variantes | estados | usado em |
| --- | --- | --- | --- |
| AppShell | tenant, parceiro | menu por módulos ativos, recolhido (mobile) | todas |
| TenantSwitcher | — | um tenant, vários | cabeçalho |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | todas |
| DataTable | com filtros, com paginação | vazio, carregando, erro | listas |
| StatusBadge | status de doc, NC, alerta, entrega, amostra, solicitação, SLA | cores por papel (ok, atenção, perigo, neutro) | listas, detalhes |
| KpiCard | número, número + variação | carregando | S03, L05, B01, A06, S24 |
| Timeline | eventos com mídia, valor, local | vazio | S14, L02, B06, A02 |
| MessageBubble | entrada, saída, sistema; texto, áudio+transcrição, imagem, documento, localização, interativo | enviado, entregue, lido, falhou | S05, C01 |
| CitationCard | trecho com documento, código, seção, versão | — | S05, S11, C01 |
| AiRunPanel | tokens, custo, latência, tools, fontes | answered, handoff, error | S05, S17 |
| FileUpload | documento, logo, evidência | arrastando, enviando, erro de tipo/tamanho | S10, S19, A05 |
| Form fields | texto, número, data, select, multi-select, tags, segredo | erro de validação | forms |
| Dialog / Drawer | confirmação, formulário lateral | — | ações |
| Toast | sucesso, erro | — | todas |
| EmptyState | com ação | — | listas |
| PeriodPicker | hoje, 7 d, 30 d, mês, personalizado | — | KPIs, relatórios, auditoria |
| ExtractionReview | campo + valor + confiança | baixa confiança destacada | A05, B02 |

## Modelo de dados

### Núcleo (§9) — todas com `id uuid`, `created_at`, `updated_at`, RLS; `tenant_id not null` exceto partners/tenants

```
partners            id, name, branding jsonb                                              escopo
partner_members     partner_id, user_id, role (admin|viewer)                              inferido: acesso ao painel do parceiro (S24)
profiles            id (= auth.users.id), full_name, email                                inferido: nome de quem tratou/aprovou
tenants             id, partner_id, name, slug, branding jsonb, settings jsonb, status    escopo
tenant_modules      tenant_id, module (log|labs|consult|adm), enabled, settings jsonb     escopo
tenant_members      tenant_id, user_id, role (owner|admin|manager|quality|operator|viewer) escopo
departments         tenant_id, name                                                       escopo

whatsapp_numbers    tenant_id, phone_number_id (único global), waba_id, display_number,
                    access_token_enc, default_module                                      escopo
whatsapp_templates  tenant_id, whatsapp_number_id?, name, category (utility|marketing),
                    language, body, status (pending|approved|rejected)                    escopo
contacts            tenant_id, wa_id, name, kind (driver|patient|staff|unknown),
                    metadata jsonb, user_id null, anonymized_at                           escopo (+ anonymized_at inferido)
consents            tenant_id, contact_id, type, version, accepted_at, revoked_at         escopo

conversations       tenant_id, contact_id, whatsapp_number_id, module, agent_key, state jsonb,
                    state_expires_at, last_message_at, last_inbound_at                    escopo (+ expiração e janela 24 h inferidos)
messages            tenant_id, conversation_id, wamid unique, direction (in|out), type, text,
                    transcription, status, error, raw jsonb, sent_at                      escopo
message_media       tenant_id, message_id, storage_path, mime, size                       escopo
handoffs            tenant_id, conversation_id, reason, summary, status (open|closed),
                    chatwoot_conversation_id, opened_at, closed_at                        escopo

documents           tenant_id, collection, code, title, owner_user_id, tags text[],
                    current_version_id, department_id?                                    escopo (+ setor p/ escopo ADM §8.3, inferido)
document_versions   tenant_id, document_id, version, status (rascunho|em_revisao|aprovado|obsoleto),
                    storage_path, effective_date, review_date, summary, approved_by,
                    approved_at, ingest_status, ingest_error                              escopo (+ status de ingestão inferido)
document_chunks     tenant_id, document_version_id, section_path, page, content, tsv tsvector,
                    embedding vector(N), token_count                                      escopo

ai_runs             tenant_id, conversation_id, message_id, agent_key, model, input_tokens,
                    output_tokens, cache_read_tokens, cost_usd, latency_ms,
                    outcome (answered|handoff|error), handoff_reason, error                escopo (+ cache e motivo inferidos)
ai_tool_calls       tenant_id, ai_run_id, tool, args jsonb, result_summary, duration_ms, ok   escopo
ai_citations        tenant_id, ai_run_id, chunk_id, document_version_id                   escopo
knowledge_gaps      tenant_id, ai_run_id, conversation_id, question, scopes text[], status   inferido: S12 "perguntas sem resposta"
audit_log           tenant_id, user_id, action, entity, entity_id, before jsonb, after jsonb   escopo

nonconformities     tenant_id, origin_module, origin_ref, title, description, location,
                    department_id, severity, status (rascunho|aberta|em_tratamento|verificacao|encerrada),
                    owner_user_id, due_date                                                escopo (+ rascunho, §5.2.3)
nc_actions          tenant_id, nonconformity_id, description, owner_user_id, due_date, done_at  escopo
evidences           tenant_id, entity, entity_id, storage_path, message_id null, description   escopo
alerts              tenant_id, module, type, severity, entity, entity_id, payload jsonb,
                    status (open|handled), handled_by, handled_at, action_taken             escopo (+ ação tomada, §5.3)
usage_daily         tenant_id, date, ai_cost_usd, wa_messages_by_category jsonb             escopo
reports             tenant_id, module, kind, period_start, period_end, format, storage_path, status  inferido: S18
```

Relações: partner 1-n tenant; tenant n-n user (tenant_members); tenant 1-n whatsapp_number;
contact 1-n conversation 1-n message 1-n message_media; conversation 1-n handoff;
document 1-n document_version 1-n document_chunk; ai_run 1-n ai_tool_call, 1-n ai_citation → chunk;
nonconformity 1-n nc_action; evidences e alerts apontam para qualquer entidade (entity, entity_id).

### Log (§5.5)

```
drivers               tenant_id, contact_id (kind=driver), name, document, active              escopo (campos inferidos)
vehicles              tenant_id, plate, description, active                                     escopo (campos inferidos)
shippers              tenant_id, name, document (CNPJ), email                                   escopo (campos inferidos)
destinations          tenant_id, shipper_id?, name, address, lat, lng                            inferido: "destinos" (§5.1)
cargo_types           tenant_id, name, temp_min, temp_max, tolerance, pop_document_id           escopo
shipments             tenant_id, code, driver_id, vehicle_id, cargo_type_id, shipper_id, origin,
                      window_start, window_end, status (planejada|em_andamento|entregue|cancelada),
                      started_at, finished_at                                                  escopo (status inferidos)
shipment_stops        tenant_id, shipment_id, seq, destination_id, status (pendente|concluida),
                      receiver_name, received_at, completed_at                                 escopo (campos inferidos)
shipment_events       tenant_id, shipment_id, stop_id?, type (checklist|temperature|occurrence|delivery|location),
                      payload jsonb, message_id, lat, lng, occurred_at                         escopo
temperature_readings  tenant_id, shipment_id, event_id, value, unit, confidence, legible,
                      in_range, deviation, message_id                                          escopo (campos inferidos)
alerts                (núcleo, module = 'log')
```

### Labs (§6)

```
units                 tenant_id, name, address, opening_hours jsonb, scheduling_url            escopo (link por unidade: pendente)
exams                 tenant_id, name, synonyms text[], prep_document_id, duration_minutes     escopo
exam_units            tenant_id, exam_id, unit_id                                              pendente: "unidade" do exame = onde é feito?
patients              tenant_id, contact_id, name, birth_date, document null                   escopo
schedule_requests     tenant_id, patient_id?, contact_id, unit_id, exams jsonb, order_data jsonb,
                      status (pendente|confirmada|cancelada), scheduled_for, confirmed_by       inferido: §6.2.4 "registra a solicitação"
samples               tenant_id, code, patient_id, exam_id, unit_id, status                     escopo
sample_events         tenant_id, sample_id, type (coleta|envio|recebimento|analise|liberacao),
                      responsible (user_id|contact_id), occurred_at, note                      escopo
```

### Consult (§7)

```
audits                tenant_id, type (interna|externa|orgao), date, scope, status              escopo
audit_requirements    tenant_id, audit_id, code, description                                   inferido: "requisitos" (§7.3)
quizzes               tenant_id, document_version_id, title, status (rascunho|publicado), published_at  inferido (§7.4)
quiz_questions        tenant_id, quiz_id, seq, question, options jsonb, correct_index, source_chunk_id  inferido
quiz_assignments      tenant_id, quiz_id, contact_id, token, sent_at                           inferido
quiz_attempts         tenant_id, quiz_id, assignment_id, answers jsonb, score, completed_at    escopo ("tentativas, nota e data")
```

### ADM Health (§8)

```
request_types         tenant_id, department_id, name, required_fields jsonb, sla_hours          escopo (formato inferido)
requests              tenant_id, code, request_type_id, department_id, requester_contact_id,
                      requester_user_id, data jsonb, status (aberta|em_andamento|aguardando|concluida),
                      due_at, completed_at, assignee_user_id                                   escopo
request_updates       tenant_id, request_id, status, note, author_user_id, notified_at          inferido: "recebe atualizações"
contracts             tenant_id, document_id, department_id, parties jsonb, object, value_cents,
                      currency, start_date, end_date, adjustment, notice_days, sla_clauses jsonb,
                      alert_days int[], extraction jsonb, status (extraido|revisado), reviewed_by  escopo (+ revisão §8.2)
```

**Entidades: 29 do núcleo + 9 Log + 7 Labs + 6 Consult + 4 ADM = 55 tabelas.**

## Matriz de funcionalidades

Ver `features.csv`. Prioridade: **must** = [MVP], **should** = requisito não funcional sem
marcação, **could** = [ETAPA 2]. A coluna `fase` diz em que fase de construção (§11) cada linha entra.

## Fora de escopo (§12)

- Integração com ERP, TMS, LIS ou agenda existente (orçamento à parte).
- Migração de dados legados. App nativo. Sensores/data loggers de temperatura.
- Redação ou revisão técnica de POPs e consultoria regulatória (responsabilidade da Nurion).
- Qualquer diagnóstico, avaliação de sintoma ou orientação clínica pela IA (regra de produto, não só de escopo).

## Tamanho

Telas 47, fluxos 35, tabelas 55. Partes difíceis: (1) garantia "sem resposta sem fonte" no loop
de agentes, (2) RLS correto em 55 tabelas + `withTenant` no worker, (3) visão com ≥ 95% de acerto em
termômetros reais, (4) WhatsApp (janela de 24 h, templates, mídia, idempotência), (5) handoff de ida
e volta com Chatwoot. Tamanho: **XL** no total; cada fase é **L** (Fase 1 é a maior: núcleo inteiro + Log).
