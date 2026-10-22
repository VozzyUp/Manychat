# Pendências e decisões em aberto

Perguntas de regra de negócio que o escopo não responde. Regra do projeto (CLAUDE.md): **pergunte,
não invente**. Enquanto não houver resposta, o código usa o padrão provisório indicado, sempre
configurável por tenant, e a linha fica aqui até ser confirmada.

## Do escopo (§13)

| # | pendência | bloqueia | padrão provisório |
| --- | --- | --- | --- |
| P01 | Qual módulo é prioridade do cliente final (ordem das Fases 2–4) | início da Fase 2 | Labs → Consult → ADM (ordem do escopo) |
| P02 | Volumes: motoristas, pacientes/mês, unidades, usuários do painel | dimensionamento da VPS e limites | VPS 4 vCPU / 8 GB; concorrência do worker 10 |
| P03 | Faixas de temperatura por tipo de carga e o POP de desvio | passo 1.12 (seed real) e 1.13 (homologação) | seed fictício: 2–8 °C, 15–25 °C, −20 °C |
| P04 | Modelos de termômetro usados | passo 1.13 (conjunto de 40 fotos) | — |
| P05 | Ferramenta de agendamento atual do laboratório | Fase 2 (link do MVP) | link por unidade, campo livre |
| P06 | Setores, tipos de solicitação e SLAs do ADM | Fase 4 | Financeiro, Qualidade, Operações, RH, TI; SLA 48 h |
| P07 | Números de WhatsApp e acesso ao Business Manager | passo 1.4 em produção, homologação | número de teste da Meta no desenvolvimento |
| P08 | Chatwoot no MVP confirmado? | passo 1.10 | sim |

## Encontradas no mapeamento

| # | pendência | onde | bloqueia | padrão provisório |
| --- | --- | --- | --- | --- |
| P09 | "unidade" no catálogo de exames é o local onde é feito ou unidade de medida? | §6.1 | Fase 2 | local (relação exame × unidade) |
| P10 | Link de agendamento é um por tenant ou um por unidade? | §6.2.4 | Fase 2 | por unidade, com fallback do tenant |
| P11 | Como o desvio de temperatura vira severidade do alerta? | §5.2.3 | passo 1.12 | dentro da tolerância = `media`; além da tolerância = `alta`; além do dobro = `critica` |
| P12 | Quem recebe o template de alerta da Qualidade (quais números)? | §5.2.3 | passo 1.12 | contatos `staff` marcados como "recebe alertas" por módulo |
| P13 | Itens obrigatórios do checklist de origem: lista fixa ou por tipo de carga? | §5.2.2 | passo 1.12 | por tipo de carga; padrão: lacre, limpeza do baú, termômetro ligado |
| P14 | Categorias de ocorrência do motorista: lista fechada? | §5.2.4 | passo 1.12 | atraso, avaria, lacre violado, acidente, outro |
| P15 | Escala de gravidade de NC | §7.2 | passo 1.11 | baixa, media, alta, critica |
| P16 | Horário de atendimento: fora do horário a IA atende? E o handoff, quem pega? | §4.4 ("horários") | passo 1.10 | IA atende 24 h; handoff fora do horário avisa que o retorno será no próximo horário útil |
| P17 | Um contato pode ter dois papéis (motorista e equipe)? | §4.3 | passo 1.5 | não: um `kind` por contato por tenant |
| P18 | Mensagem de `unknown` num número que não é de laboratório: o que fazer? | §4.3 | passo 1.5 | resposta padrão de identificação + handoff |
| P19 | Retenção padrão de dados (dias) e o que a anonimização mantém | §10 | passo 1.11 | 5 anos para registros operacionais; anonimização mantém métricas e eventos sem dados pessoais |
| P20 | 2FA obrigatório para algum papel (owner/admin)? | §2 | passo 1.3 | opcional para todos |
| P21 | Limite de gasto de IA por tenant (alerta ou bloqueio)? | §10 custos | passo 1.6 | alerta ao parceiro acima de US$ 50/dia, sem bloqueio |
| P22 | Provedor de embeddings: OpenAI ou Voyage? | §2 | passo 1.7 | OpenAI `text-embedding-3-small` (como no `.env.example`) |
| P23 | Hospedagem: provedor da VPS, domínios do painel/API, onde roda o Chatwoot | §2 infra | passo 1.13 | — |
| P24 | Embarcador recebe o relatório PDF como? (download no painel no MVP) | §5.3 | passo 1.12 | gestor baixa e envia; e-mail automático é ETAPA 2 |

## Decididas

Quando uma pendência for respondida, mova para cá com a data, quem decidiu e o que muda.

| # | decisão | data | quem |
| --- | --- | --- | --- |
| — | O Nurion Hub substitui o clone de ManyChat neste repositório | 2026-10-22 | Fernando |
