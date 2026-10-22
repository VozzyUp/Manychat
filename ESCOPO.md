# Nurion Hub — Escopo Técnico de Desenvolvimento

Plataforma multiempresa de IA para saúde, com 4 módulos sobre um núcleo único:
**Nurion Log**, **Nurion Labs**, **Nurion Consult** e **Nurion ADM Health**.

- Desenvolvedor: VozzyUp (Fernando)
- Parceiro comercial: Nurion Hub Health Tech (consultoria que revende)
- Cliente final inicial: empresa de saúde de pequeno/médio porte (farmacêuticas, laboratórios, transporte de carga sensível)
- Versão do documento: 1.0 — 22/10/2026

> Itens marcados **[MVP]** entram na primeira entrega de cada módulo.
> Itens marcados **[ETAPA 2]** ficam especificados, mas só são construídos depois do aceite do MVP do módulo.

---

## 1. Princípios do produto

1. **Uma plataforma, quatro módulos.** Nada de código duplicado entre módulos. Tudo que se repete vai para o núcleo.
2. **IA dentro do código.** Sem n8n ou outra ferramenta de automação visual. A orquestração dos agentes é TypeScript chamando a API da Anthropic diretamente.
3. **A IA só responde com base aprovada.** Toda resposta informativa vem de documentos do cliente (RAG), cita a fonte e, quando não há base suficiente, transfere para um humano. A IA não inventa.
4. **Tudo auditável.** Cada mensagem, chamada de modelo, ferramenta executada e fonte citada fica registrada.
5. **Isolamento por cliente (tenant).** Toda tabela de negócio tem `tenant_id` e RLS no Postgres. Um tenant nunca enxerga dado de outro.
6. **WhatsApp é o canal do campo.** Motoristas, pacientes e equipes operacionais usam só o WhatsApp. Gestores usam o painel web.
7. **Marca da Nurion.** O painel é white-label: nome, logo e cores vêm da configuração do tenant/parceiro.

---

## 2. Stack

| Camada | Tecnologia |
| --- | --- |
| Linguagem | TypeScript (strict) em todo o projeto |
| Monorepo | pnpm workspaces + Turborepo |
| Painel web | Next.js (App Router) + Tailwind + shadcn/ui |
| API | Fastify (Node 22) |
| Filas e jobs | BullMQ sobre Redis |
| Banco | PostgreSQL via Supabase (região São Paulo), com RLS e pgvector |
| Arquivos | Supabase Storage (buckets privados, URLs assinadas) |
| Autenticação | Supabase Auth (e-mail + senha, 2FA opcional) |
| IA (texto e visão) | Anthropic API — SDK oficial `@anthropic-ai/sdk`, com tool use |
| Embeddings | Provedor configurável por env (padrão: Voyage AI ou OpenAI `text-embedding-3-small`) |
| Transcrição de áudio | Whisper (Groq `whisper-large-v3-turbo`, configurável) |
| WhatsApp | WhatsApp Cloud API oficial da Meta |
| Caixa de atendimento humano | Chatwoot self-hosted via API **[MVP]**; caixa própria no painel **[ETAPA 2]** |
| Validação | zod em toda entrada externa (webhooks, API, saída estruturada da IA) |
| Testes | Vitest (unidade/integração) + Playwright (painel, fluxos críticos) |
| Infra | Docker + Traefik em VPS, CI/CD via GitHub Actions |
| Observabilidade | Logs estruturados (pino), Sentry para erros, painel de custo por tenant |

### Modelos de IA (configuráveis por env, nunca fixos no código)

```env
LLM_MODEL_AGENT=claude-sonnet-5-5   # conversa e decisões dos agentes
LLM_MODEL_FAST=claude-haiku-5-5     # classificação, roteamento, extração simples
LLM_MODEL_VISION=claude-sonnet-5-5  # leitura de termômetro, pedido médico, documentos
```

---

## 3. Estrutura do repositório

```
nurion-hub/
├── CLAUDE.md
├── ESCOPO.md
├── apps/
│   ├── web/                # painel Next.js
│   ├── api/                # Fastify: webhooks, API REST do painel
│   └── worker/             # BullMQ: processamento de mensagens, ingestão de documentos, jobs agendados
├── packages/
│   ├── core/               # motor de agentes, RAG, multimodal, auditoria, handoff
│   ├── db/                 # tipos gerados, cliente Supabase, helpers de tenant
│   ├── whatsapp/           # cliente Cloud API, parsing de webhook, templates
│   ├── modules/
│   │   ├── log/
│   │   ├── labs/
│   │   ├── consult/
│   │   └── adm/
│   └── shared/             # zod schemas, utilidades, constantes
├── supabase/
│   ├── migrations/
│   └── seed.sql
└── infra/
    ├── docker-compose.yml
    └── traefik/
```

Regra: `packages/modules/*` dependem de `packages/core`, nunca o contrário. Um módulo nunca importa outro módulo.

---

## 4. Núcleo da plataforma

### 4.1 Multiempresa e acessos [MVP]

- `partners` (Nurion) → `tenants` (clientes finais) → `users`.
- Papéis por tenant: `owner`, `admin`, `manager`, `quality`, `operator`, `viewer`.
- Usuário pode pertencer a mais de um tenant (troca de tenant no painel).
- Permissão por módulo: um tenant ativa só os módulos contratados (`tenant_modules`).
- Toda query de negócio passa por RLS usando `auth.uid()` + tabela `tenant_members`.
- Jobs do worker usam service role, mas **sempre** filtram por `tenant_id` explicitamente (helper obrigatório `withTenant(tenantId)`).

### 4.2 Canal WhatsApp [MVP]

- Um ou mais números por tenant (`whatsapp_numbers`: `phone_number_id`, `waba_id`, token criptografado).
- Webhook único `POST /webhooks/whatsapp`:
  1. Validar assinatura `X-Hub-Signature-256`.
  2. Responder 200 imediatamente.
  3. Enfileirar o payload bruto (`queue: inbound-messages`).
- Idempotência: `messages.wamid` único. Mensagem duplicada é ignorada.
- Tipos suportados: texto, áudio, imagem, documento (PDF), localização, botões e listas interativas.
- Download de mídia → Storage (`tenant_id/yyyy/mm/wamid.ext`) → referência em `message_media`.
- Envio: texto livre dentro da janela de 24 h; fora dela, só template aprovado.
- Templates gerenciados no painel (`whatsapp_templates`) com categoria (utility/marketing) e status de aprovação.
- Status de entrega (sent/delivered/read/failed) atualizados via webhook.

### 4.3 Identificação de contato e roteamento [MVP]

Ao chegar uma mensagem:

1. Resolver o tenant pelo `phone_number_id`.
2. Buscar o contato pelo número (`contacts`). Cada contato tem `kind`: `driver`, `patient`, `staff`, `unknown`.
3. Rotear para o agente:
   - `driver` → agente do Log
   - `patient` / `unknown` em número de laboratório → agente do Labs
   - `staff` → classificador rápido (`LLM_MODEL_FAST`) decide entre Consult, ADM ou Log, com base na intenção e nos módulos ativos
4. Conversa aberta com humano (handoff ativo) → não passa pela IA, vai direto para a caixa de atendimento.

Cada número pode ter um `default_module` para simplificar o roteamento.

### 4.4 Motor de agentes [MVP]

Um agente = configuração + ferramentas + regras.

```ts
type AgentDefinition = {
  key: string;                  // 'log.driver', 'labs.patient', 'consult.copilot', 'adm.requests'
  module: 'log' | 'labs' | 'consult' | 'adm';
  systemPrompt: (ctx: AgentContext) => string;
  tools: ToolDefinition[];      // tools do núcleo + tools do módulo
  knowledgeScopes: string[];    // quais coleções de documentos pode consultar
  requireCitation: boolean;     // true para respostas informativas
  maxTurns: number;             // limite de iterações de tool use por mensagem
};
```

Loop por mensagem recebida (no worker):

1. Montar o contexto: definição do agente, configuração do tenant (nome, regras, horários), últimas N mensagens da conversa e estado da conversa (`conversation_state`, JSON por módulo).
2. Pré-processar a mídia: áudio vira transcrição; imagem vai como bloco de imagem para o modelo de visão.
3. Chamar o modelo com as tools. Executar as tools pedidas, devolver o resultado e repetir até ter a resposta final ou atingir `maxTurns`.
4. Validar a saída: se `requireCitation` e a resposta é informativa, ela precisa referenciar ao menos um `chunk_id` retornado pela busca. Caso contrário, a resposta é descartada e é feito o handoff.
5. Enviar a resposta pelo WhatsApp.
6. Registrar tudo em `ai_runs` e `ai_tool_calls`.

Tools do núcleo, disponíveis a todos os agentes:

| Tool | O que faz |
| --- | --- |
| `search_knowledge` | Busca na base do tenant (escopo do agente) e retorna trechos com `document_id`, `version`, título, seção e texto |
| `handoff_to_human` | Abre atendimento humano com resumo e motivo, e avisa o contato |
| `create_nonconformity` | Registra não conformidade (usada por Log e Consult) |
| `attach_evidence` | Vincula mídia da conversa a um registro (entrega, NC, auditoria) |
| `get_contact_profile` | Dados do contato atual |
| `send_template` | Envia template aprovado (alertas) |

Guardrails obrigatórios no system prompt de todo agente:

- Responder só com base nos trechos retornados por `search_knowledge` ou nos dados retornados por tools.
- Sem base suficiente: dizer que vai encaminhar e chamar `handoff_to_human`.
- Nunca dar diagnóstico, prescrição ou orientação clínica fora do POP/manual do cliente.
- Formato de citação no WhatsApp: `📄 Fonte: <título do documento>, <seção> (v<versão>)`.
- Português do Brasil, mensagens curtas, adequadas ao WhatsApp.

### 4.5 Gestão de documentos e RAG [MVP]

Coração da plataforma.

**Cadastro**

- Upload pelo painel: PDF, DOCX, TXT, MD.
- Cada documento tem `collection`: `pop`, `manual`, `norma`, `contrato`, `politica`, `faq`, `preparo_exame`, `outro`.
- Metadados: título, código (ex.: POP-015), responsável, data de vigência, data de revisão, tags.
- Status: `rascunho` → `em_revisao` → `aprovado` → `obsoleto`. **Só documentos `aprovado` alimentam a IA.**

**Versionamento**

- Nova versão de um documento existente cria `document_versions`.
- A versão anterior vira `obsoleto` automaticamente quando a nova é aprovada.
- A busca usa só a versão vigente.
- O histórico fica disponível para auditoria: qual versão respondeu cada pergunta.

**Ingestão (job `ingest-document`)**

1. Extrair texto (pdf-parse/mammoth; OCR com o modelo de visão para PDFs escaneados).
2. Detectar a estrutura (títulos, seções, numeração de itens).
3. Fazer o chunking por seção: cerca de 500–800 tokens, sobreposição de 80, sem quebrar um item no meio.
4. Gerar os embeddings e gravar em `document_chunks` (`embedding vector`, `section_path`, `page`).
5. Gerar um resumo curto do documento (usado na listagem e no monitoramento normativo).

**Busca (`search_knowledge`)**

- Busca híbrida: vetorial (pgvector, cosseno) + full-text Postgres (`tsvector`, português), combinadas por RRF.
- Filtros: `tenant_id`, `collection IN (escopo do agente)`, `status = aprovado`.
- Top 6 trechos, com limiar mínimo de relevância. Abaixo do limiar, retorna vazio, o que força o handoff.
- Retorna `chunk_id`, `document_id`, `version`, título, código, seção, página e texto.

**Painel**

- Lista de documentos com filtros e status.
- Tela "Testar a base": o gestor faz uma pergunta e vê a resposta e os trechos usados.
- Indicador de perguntas sem resposta (perguntas que caíram em handoff por falta de base), para a Nurion completar a documentação.

### 4.6 Multimodal [MVP]

- **Áudio:** transcrição via Whisper. O texto transcrito fica gravado na mensagem e é mostrado no painel.
- **Imagem:** enviada ao modelo de visão junto com instrução específica da tool (ex.: `read_thermometer`, `read_medical_order`). Sempre com saída estruturada (zod) e campo `confidence`.
- **Documento PDF recebido no WhatsApp:** extraído e anexado ao contexto, ou salvo como evidência, conforme o fluxo.

### 4.7 Atendimento humano (handoff) [MVP]

- MVP: integração com Chatwoot (inbox API por tenant). No handoff:
  - cria ou atualiza o contato e a conversa no Chatwoot, com o histórico resumido;
  - as mensagens do humano no Chatwoot voltam via webhook e saem pelo WhatsApp;
  - enquanto `handoff.status = open`, a IA não responde;
  - quando o humano resolve no Chatwoot, `handoff.status = closed` e a IA volta a atender.
- **[ETAPA 2]:** caixa de atendimento própria no painel, eliminando o Chatwoot.

### 4.8 Auditoria [MVP]

- `audit_log`: toda ação de usuário no painel (quem, o quê, quando, antes/depois).
- `ai_runs`: por mensagem processada — agente, modelo, tokens de entrada/saída, custo estimado, latência, resultado (`answered`, `handoff`, `error`).
- `ai_tool_calls`: tool, argumentos, resultado resumido, duração.
- `ai_citations`: quais chunks/versões embasaram cada resposta.
- Logs imutáveis para usuários (sem update/delete via API). Exportação CSV por período.

### 4.9 Painéis base e relatórios [MVP]

- Painel inicial do tenant: conversas do dia, handoffs abertos, alertas abertos, NCs abertas, consumo de IA e WhatsApp no mês.
- Gerador de relatórios: PDF/CSV por período e por módulo, usando um template base reaproveitado pelos módulos.
- Painel do parceiro (Nurion): visão de todos os tenants, uso e custo por tenant.

### 4.10 Jobs agendados (BullMQ repeatable) [MVP]

- Alertas de vencimento (contratos e documentos com revisão vencida).
- Relatórios periódicos.
- Limpeza de estado de conversa expirado.
- Consolidação diária de custos por tenant.

---

## 5. Módulo Nurion Log

**Objetivo:** cada etapa de uma entrega de carga sensível gera uma evidência estruturada. Desvios de temperatura disparam alerta imediato.

### 5.1 Cadastros [MVP]

- Motoristas (vinculados a `contacts` com `kind = driver`), veículos, clientes/embarcadores, destinos.
- Tipos de carga com faixa de temperatura (`temp_min`, `temp_max`), tolerância e POP associado.
- Rotas/entregas (`shipments`): motorista, veículo, tipo de carga, origem, destinos, janela prevista e status.

### 5.2 Fluxo do motorista no WhatsApp [MVP]

1. **Início da rota.** O motorista envia "iniciar" ou o sistema envia o template de rota do dia. A IA confirma qual entrega está ativa.
2. **Checklist de origem por áudio.** O motorista fala o checklist (ex.: lacre, limpeza do baú, termômetro ligado). A IA transcreve, extrai os itens em formato estruturado e pede o que faltou.
3. **Leitura de temperatura** na coleta, em pontos intermediários e na entrega:
   - o motorista envia a foto do termômetro;
   - a tool `read_thermometer` (visão) retorna `{ value, unit, confidence, legible }`;
   - com `confidence < 0.8` ou ilegível, a IA pede nova foto;
   - o valor é comparado com a faixa do tipo de carga;
   - fora da faixa: cria `alert` (severidade por desvio), envia template de alerta à Qualidade com motorista, operação, temperatura, localização (link do Maps) e foto, e abre NC automaticamente em rascunho;
   - a IA orienta o motorista apenas com o que está no POP de desvio de temperatura (via `search_knowledge`).
4. **Ocorrências.** O motorista relata por áudio ou texto (atraso, avaria, lacre violado). A IA categoriza e abre NC com evidências.
5. **Entrega.** O motorista envia foto do comprovante e da carga. A IA extrai os dados do comprovante (recebedor, data/hora), registra a entrega e fecha a parada.
6. **Localização.** Pede a localização do WhatsApp nos eventos de temperatura e de entrega.

### 5.3 Painel [MVP]

- Lista de entregas com status e linha do tempo de eventos (cada evento com foto, valor, hora e localização).
- Alertas abertos e tratamento (quem tratou, ação tomada).
- Relatório por entrega (PDF) para o embarcador: eventos, leituras de temperatura e evidências.
- Indicadores: entregas no período, % com desvio, tempo médio de tratamento de alerta.

### 5.4 [ETAPA 2]

- Relatório automático enviado ao embarcador por e-mail ao fim de cada entrega.
- Gráfico de temperatura por rota.
- Integração com TMS (sob orçamento).
- Previsão de risco por rota/horário a partir do histórico.

### 5.5 Tabelas

`drivers`, `vehicles`, `cargo_types`, `shippers`, `shipments`, `shipment_stops`, `shipment_events` (`type`: checklist | temperature | occurrence | delivery | location), `temperature_readings`, `alerts`.

### 5.6 Critérios de aceite do MVP

- [ ] Foto de termômetro legível é lida corretamente em ≥ 95% de um conjunto de 40 fotos reais de teste.
- [ ] Leitura fora da faixa gera alerta para a Qualidade em menos de 30 s após o envio da foto.
- [ ] Checklist por áudio é estruturado e itens faltantes são cobrados.
- [ ] Relatório PDF da entrega contém todos os eventos com evidência.
- [ ] Nenhuma orientação ao motorista sem citação de POP.

---

## 6. Módulo Nurion Labs

**Objetivo:** reduzir dúvidas repetitivas e falhas de preparo de exame, organizar agendamentos e rastrear amostras.

### 6.1 Cadastros [MVP]

- Catálogo de exames (`exams`): nome, sinônimos, preparo (vinculado a documento `preparo_exame`), duração e unidade.
- Unidades (endereço e horário).
- Pacientes (`patients`, ligados a `contacts`): nome, data de nascimento, documento opcional e consentimento LGPD registrado.

### 6.2 Fluxo do paciente no WhatsApp [MVP]

1. **Boas-vindas e consentimento.** No primeiro contato, a IA envia o aviso de privacidade e registra o aceite (`consents`). Sem aceite, o atendimento segue só com informação geral, sem coletar dados pessoais.
2. **Dúvidas de preparo.** Respostas só via `search_knowledge` (coleção `preparo_exame`), sempre com fonte. Fora da base, faz handoff.
3. **Leitura do pedido médico.** O paciente envia a foto e a tool `read_medical_order` retorna `{ exams: [{ raw, matched_exam_id, confidence }], doctor, date }`. A IA confirma a lista com o paciente antes de seguir. Exame não identificado vai para handoff.
4. **Agendamento [MVP — versão simples].** A IA oferece a unidade e envia o link de agendamento configurado pelo tenant, ou registra a solicitação de agendamento para a recepção confirmar no painel.
5. **Lembrete.** Template de lembrete com o preparo do exame, 24–48 h antes, quando houver data registrada.
6. **Sintomas ou urgência.** Qualquer menção a sintoma grave aciona a resposta padrão de buscar atendimento médico, mais handoff. A IA nunca avalia sintomas.

### 6.3 Rastreabilidade de amostras [MVP — básico]

- Amostra (`samples`) com código, paciente, exame e unidade.
- Eventos (`sample_events`): coleta, envio, recebimento, análise e liberação. Cada um com responsável, data/hora e observação.
- Registro de evento pelo painel ou pelo WhatsApp da equipe (`staff`: "amostra 12345 recebida").
- Consulta da linha do tempo da amostra no painel.

### 6.4 Painel [MVP]

- Conversas, dúvidas mais frequentes, perguntas sem base e solicitações de agendamento pendentes.
- Amostras por status e amostras paradas há mais de X horas (configurável).

### 6.5 [ETAPA 2]

- Agenda própria com disponibilidade por unidade e confirmação automática.
- Integração com sistema do laboratório (LIS) e agenda existente (sob orçamento).
- Rastreabilidade completa de biobanco/pesquisa clínica (amostras cegas, cadeia de custódia).

### 6.6 Critérios de aceite do MVP

- [ ] Dúvida de preparo coberta pela base é respondida com fonte correta.
- [ ] Dúvida fora da base resulta em handoff, nunca em resposta inventada.
- [ ] Pedido médico legível tem ≥ 90% dos exames identificados no conjunto de teste.
- [ ] Consentimento registrado antes de qualquer dado pessoal ser salvo.

---

## 7. Módulo Nurion Consult

**Objetivo:** copiloto regulatório para Responsável Técnico e Qualidade — consulta a POPs e normas com fonte, registro de não conformidades, evidências e treinamento.

### 7.1 Copiloto [MVP]

- Usuário `staff` pergunta por WhatsApp ou pelo chat no painel.
- Escopo de busca: `pop`, `manual`, `norma`, `politica`.
- Resposta sempre com referência (código do POP, seção, versão ou norma/artigo).
- Pedido de análise de foto (ex.: "verifique esta foto do veículo segundo a ANTT"): a IA analisa a imagem **contra os trechos de norma retornados pela busca** e responde com os pontos observados e a referência. Deixa claro que é apoio à inspeção, não laudo.

### 7.2 Não conformidades [MVP]

- Abertura por áudio, texto ou foto. A IA estrutura em `{ titulo, descricao, local, setor, gravidade, evidencias }` e confirma com o usuário antes de registrar.
- Notificação ao responsável da Qualidade.
- Ciclo: `aberta` → `em_tratamento` (ação corretiva, responsável, prazo) → `verificacao` → `encerrada`.
- NCs dos módulos Log e Labs aparecem na mesma lista, com origem identificada.

### 7.3 Evidências e auditorias [MVP]

- Auditoria (`audits`): tipo (interna/externa/órgão), data, escopo e requisitos.
- Evidências (`evidences`) vinculadas a requisito/auditoria: arquivos, mídias do WhatsApp e registros do sistema.
- Busca rápida de evidência por requisito ("mostre as evidências de controle de temperatura do último trimestre").

### 7.4 Treinamentos [MVP]

- Gerar quiz (5–10 questões) a partir de um documento aprovado. O gestor revisa e publica.
- Envio para colaboradores pelo WhatsApp (perguntas interativas) ou link no painel.
- Registro de tentativas, nota e data. Relatório de quem está pendente.

### 7.5 Monitoramento normativo [ETAPA 2]

- Lista fechada de fontes por tenant (ex.: DOU seção 1 com filtro ANVISA/ANTT, portal ANVISA).
- Job diário coleta novas publicações, filtra por palavras-chave e temas do tenant e gera um resumo.
- A IA cruza o resumo com os documentos do tenant e aponta quais POPs podem ser afetados.
- Alerta para a Qualidade. **A decisão de alterar POP é sempre humana.**

### 7.6 Critérios de aceite do MVP

- [ ] 100% das respostas informativas com referência verificável.
- [ ] NC registrada por áudio com os campos corretos após confirmação.
- [ ] Quiz gerado só com conteúdo do documento de origem.

---

## 8. Módulo Nurion ADM Health

**Objetivo:** organizar o backoffice — solicitações internas, documentos e contratos com vencimento, relatórios e visão executiva.

### 8.1 Solicitações internas [MVP]

- Abertura por WhatsApp (`staff`) ou pelo painel.
- A IA classifica o setor (Financeiro, Qualidade, Operações, RH, TI — configurável) e o tipo, e coleta os dados obrigatórios do tipo.
- SLA por tipo de solicitação. Status: `aberta` → `em_andamento` → `aguardando` → `concluida`.
- O solicitante recebe atualizações pelo WhatsApp e pode consultar o status ("como está minha solicitação?").

### 8.2 Contratos e documentos [MVP]

- Upload de contrato e extração automática de partes, objeto, valor, vigência (início/fim), reajuste, aviso prévio e cláusulas de SLA. **Revisão humana obrigatória** antes de salvar.
- Alertas de vencimento configuráveis (ex.: 90/60/30 dias antes), por WhatsApp e no painel.
- Perguntas sobre contratos pelo copiloto ("qual o prazo de aviso do contrato X?"), respondidas com citação da cláusula.

### 8.3 Agentes por setor [MVP]

- Mesma engine, com escopo de base por setor (ex.: o Financeiro consulta só `politica` + `contrato` do financeiro).

### 8.4 Relatórios e painel executivo [MVP]

- Relatório semanal automático: solicitações por setor, SLA cumprido, contratos a vencer e NCs abertas.
- Painel executivo com esses indicadores e filtro de período.

### 8.5 [ETAPA 2]

- Indicadores preditivos (tendência de backlog por setor).
- Integração com ERP (sob orçamento).

### 8.6 Critérios de aceite do MVP

- [ ] Solicitação aberta por WhatsApp chega ao setor certo em ≥ 90% dos casos de teste.
- [ ] Alerta de vencimento disparado na data configurada.
- [ ] Extração de contrato pré-preenche ≥ 80% dos campos corretamente no conjunto de teste.

---

## 9. Modelo de dados — tabelas do núcleo

Todas com `id uuid`, `tenant_id uuid not null` (exceto `partners`/`tenants`), `created_at`, `updated_at` e RLS habilitado.

```
partners(id, name, branding jsonb)
tenants(id, partner_id, name, slug, branding jsonb, settings jsonb, status)
tenant_modules(tenant_id, module, enabled, settings jsonb)
tenant_members(tenant_id, user_id, role)
departments(tenant_id, name)

whatsapp_numbers(tenant_id, phone_number_id, waba_id, display_number, access_token_enc, default_module)
whatsapp_templates(tenant_id, name, category, language, body, status)
contacts(tenant_id, wa_id, name, kind, metadata jsonb, user_id null)
consents(tenant_id, contact_id, type, version, accepted_at, revoked_at)

conversations(tenant_id, contact_id, whatsapp_number_id, module, agent_key, state jsonb, last_message_at)
messages(tenant_id, conversation_id, wamid unique, direction, type, text, transcription, status, raw jsonb)
message_media(tenant_id, message_id, storage_path, mime, size)
handoffs(tenant_id, conversation_id, reason, summary, status, chatwoot_conversation_id, opened_at, closed_at)

documents(tenant_id, collection, code, title, owner_user_id, tags text[], current_version_id)
document_versions(tenant_id, document_id, version, status, storage_path, effective_date, review_date, summary, approved_by, approved_at)
document_chunks(tenant_id, document_version_id, section_path, page, content, tsv tsvector, embedding vector(N))

ai_runs(tenant_id, conversation_id, message_id, agent_key, model, input_tokens, output_tokens, cost_usd, latency_ms, outcome)
ai_tool_calls(tenant_id, ai_run_id, tool, args jsonb, result_summary, duration_ms)
ai_citations(tenant_id, ai_run_id, chunk_id, document_version_id)
audit_log(tenant_id, user_id, action, entity, entity_id, before jsonb, after jsonb)

nonconformities(tenant_id, origin_module, origin_ref, title, description, location, department_id, severity, status, owner_user_id, due_date)
nc_actions(tenant_id, nonconformity_id, description, owner_user_id, due_date, done_at)
evidences(tenant_id, entity, entity_id, storage_path, message_id null, description)
alerts(tenant_id, module, type, severity, entity, entity_id, payload jsonb, status, handled_by, handled_at)
usage_daily(tenant_id, date, ai_cost_usd, wa_messages_by_category jsonb)
```

As tabelas específicas de cada módulo estão nas seções 5 a 8.

---

## 10. Requisitos não funcionais

**Segurança e LGPD**

- Dados de saúde são dados sensíveis: criptografia em trânsito (TLS) e em repouso. Tokens de terceiros criptografados na aplicação (`pgcrypto` ou chave em env).
- Buckets privados, acesso só por URL assinada de curta duração.
- Consentimento registrado para pacientes.
- Retenção configurável por tenant. Exclusão/anonimização de contato a pedido do titular.
- Exportação completa dos dados do tenant (JSON + arquivos) ao fim do contrato.
- Provedores de IA usados via API, sem uso de dados para treinamento.
- Nunca enviar à IA dados que a tarefa não precisa (minimização).

**Confiabilidade**

- Webhook responde em < 1 s. Processamento assíncrono com retry exponencial e dead-letter queue.
- Resposta da IA ao usuário em < 15 s no p95 (texto) e < 25 s (com imagem ou áudio).
- Backup diário do banco com retenção de 30 dias. Teste de restauração mensal.

**Custos**

- Registrar o custo de cada chamada de IA e cada mensagem de WhatsApp por tenant.
- Usar `LLM_MODEL_FAST` para classificação/roteamento. O modelo maior só para conversa e visão.
- Prompt caching nos system prompts longos.

**Qualidade**

- Conjunto de avaliação por módulo (`/evals`): perguntas + respostas esperadas + fontes esperadas, rodando no CI. Mudança de prompt que piora o resultado não sobe.
- Testes de RLS: um usuário de tenant A não lê nada do tenant B (teste automatizado por tabela).

---

## 11. Ordem de construção

### Fase 1 — Núcleo + Nurion Log

1. Monorepo, lint, CI, docker-compose local (Postgres via Supabase CLI + Redis).
2. Migrations do núcleo: tenants, membros, RLS e testes de RLS.
3. Auth e painel base: login, troca de tenant, layout white-label.
4. Webhook WhatsApp: validação, fila, idempotência, download de mídia, envio de texto e template.
5. Contatos, conversas, mensagens e roteamento.
6. Motor de agentes: loop de tool use, `ai_runs`, `ai_tool_calls`, limites.
7. Documentos: upload, versões, aprovação, ingestão, chunking, embeddings.
8. `search_knowledge` híbrida + validação de citação + tela "Testar a base".
9. Multimodal: transcrição de áudio e visão com saída estruturada.
10. Handoff via Chatwoot (ida e volta).
11. Auditoria, NCs, evidências e alertas (núcleo).
12. Módulo Log: cadastros → fluxo do motorista → `read_thermometer` → alertas → entrega → painel → relatório PDF.
13. Evals do Log + homologação com fotos e áudios reais.

### Fase 2 — Nurion Labs

Cadastros → consentimento → agente do paciente → `read_medical_order` → solicitação de agendamento → amostras → painel → evals.

### Fase 3 — Nurion Consult

Copiloto → NC por áudio → auditorias e evidências → quiz e treinamentos → painel → evals.

### Fase 4 — Nurion ADM Health

Solicitações e SLA → contratos e extração → alertas de vencimento → agentes por setor → relatório semanal e painel executivo → evals.

### Depois do aceite

Itens [ETAPA 2] conforme prioridade do cliente final.

---

## 12. Fora de escopo

- Integração com ERP, TMS, LIS ou agenda existente (orçamento à parte).
- Migração de dados legados.
- App nativo.
- Sensores/data loggers de temperatura.
- Redação ou revisão técnica de POPs e consultoria regulatória (responsabilidade da Nurion).

---

## 13. Pendências a confirmar com a Nurion / cliente final

- [ ] Qual módulo é prioridade do cliente final (define a ordem das Fases 2–4).
- [ ] Volumes: nº de motoristas, pacientes/mês, unidades, usuários do painel.
- [ ] Faixas de temperatura por tipo de carga e o POP de desvio.
- [ ] Modelos de termômetro usados (para o conjunto de teste de leitura).
- [ ] Ferramenta de agendamento atual do laboratório (para o link do MVP).
- [ ] Lista de setores, tipos de solicitação e SLAs do ADM.
- [ ] Números de WhatsApp e acesso ao Business Manager do cliente final.
- [ ] Caixa de atendimento: Chatwoot no MVP confirmado?
