# API do Nurion Hub

Referência da `apps/api` (Fastify). A lista completa de rotas planejadas, com papel mínimo e tela,
está em [`replica/architecture.md`](../replica/architecture.md#api). Esta página documenta o contrato
das rotas **já implementadas** — cada passo de construção acrescenta as suas aqui.

## Convenções

**Base URL:** `https://api.<dominio>` (local: `http://localhost:4000`).

**Autenticação do painel:**

```http
Authorization: Bearer <access_token da sessão do Supabase>
x-tenant-id: <uuid do tenant ativo>
```

A API valida o JWT, confere se o usuário é membro do tenant com o papel mínimo da rota e repassa o JWT
ao Supabase, então o RLS do Postgres também vale.

**Corpo:** JSON validado por zod. Uploads em `multipart/form-data`.

**Erros:** sempre no mesmo formato.

```json
{ "error": { "code": "validation_error", "message": "Campo obrigatório: title", "details": [ ... ] } }
```

| HTTP | `code` | quando |
| --- | --- | --- |
| 400 | `validation_error` | corpo/query fora do schema |
| 401 | `unauthenticated` | sem token ou token inválido/expirado |
| 403 | `forbidden` | não é membro do tenant ou papel insuficiente; módulo não contratado |
| 404 | `not_found` | registro não existe **ou** é de outro tenant (nunca revelamos qual) |
| 409 | `conflict` | transição de status inválida, duplicidade |
| 413 | `payload_too_large` | upload acima do limite (20 MB no painel) |
| 422 | `unprocessable` | regra de negócio (ex.: aprovar versão sem arquivo) |
| 429 | `rate_limited` | limite por usuário/IP |
| 500 | `internal_error` | erro inesperado (vai para o Sentry com `request_id`) |

Toda resposta traz `x-request-id`; informe esse id ao reportar um problema.

**Paginação:** `?limit=50&cursor=<opaco>`; resposta `{ "data": [...], "next_cursor": "..." | null }`.

**Datas:** ISO 8601 em UTC (`2026-10-22T13:00:00Z`). O painel converte para o fuso do tenant.

## Webhooks

### `GET /webhooks/whatsapp` — verificação da Meta

```http
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=123
```

`200` com corpo `123` se o token confere; `403` se não.

### `POST /webhooks/whatsapp` — eventos

Cabeçalho obrigatório: `X-Hub-Signature-256: sha256=<hmac do corpo bruto com WHATSAPP_APP_SECRET>`.

- Assinatura inválida → `401`.
- Assinatura válida → payload bruto vai para a fila `inbound-messages` e a resposta é `200` vazio,
  sem esperar processamento (meta: < 1 s).

### `POST /webhooks/chatwoot/:token` — eventos do Chatwoot

`:token` é o segredo de webhook do tenant (gerado na configuração do Chatwoot do tenant). Eventos
usados: `message_created` (mensagens de saída não privadas do atendente) e `conversation_status_changed`
(`resolved` encerra o handoff). Resposta `200` após enfileirar em `chatwoot-events`.

## Saúde

| rota | resposta |
| --- | --- |
| `GET /health` | `200 { "status": "ok" }` se o processo está vivo |
| `GET /ready` | `200` se Redis e banco respondem; `503` com o que falhou |

## Rotas `/v1`

Papel mínimo entre parênteses. Toda rota com tenant exige `x-tenant-id` de um tenant ativo do qual o
usuário é membro (senão `403`). Quem ativou 2FA só passa com sessão verificada em duas etapas (`aal2`).

### `GET /v1/me` (autenticado)

Quem sou, minhas empresas (com marca já resolvida e módulos ativos) e meus vínculos de parceiro.

```json
{
  "user": { "id": "…", "email": "gestor@demo.local", "full_name": "Gestora Demo" },
  "tenants": [
    {
      "role": "owner",
      "tenant": {
        "id": "…", "name": "Transportadora Demo", "slug": "transportadora-demo", "status": "active",
        "timezone": "America/Sao_Paulo", "modules": ["log", "consult", "adm"],
        "branding": { "productName": "Nurion Hub", "logoUrl": null, "accent": "#0f766e",
                      "onAccent": "#ffffff", "accentText": "#0f766e" }
      }
    }
  ],
  "partners": []
}
```

### `GET /v1/tenant` (viewer) · `PATCH /v1/tenant` (admin)

Dados gerais e white-label do tenant ativo. No `PATCH`, todos os campos são opcionais e `null` remove a
chave (volta ao padrão do parceiro).

```json
{
  "name": "Transportadora Demo Ltda",
  "branding": { "name": "Transportes Demo", "primary": "#7c3aed" },
  "settings": { "timezone": "America/Manaus", "business_hours": "Seg–Sex 8h–18h", "rules": "…" }
}
```

Resposta: o tenant com `branding` (como salvo) e `resolved_branding` (cores finais; o texto sobre a cor e a
cor de link são ajustados para contraste ≥ 4,5:1). Cor fora de `#RRGGBB` ou fuso inexistente → `400`.

### `POST /v1/tenant/logo` · `DELETE /v1/tenant/logo` (admin)

`multipart/form-data` com o campo `file`: PNG, JPG ou WEBP (conferido pelo conteúdo, não só pelo tipo
declarado), até 1 MB. SVG é recusado. O arquivo vai para o bucket público `branding` em `<tenant>/` e a URL
entra em `branding.logo_url`. Erros: `400` tipo inválido, `413` grande demais.

### Equipe (admin)

| rota | corpo | respostas |
| --- | --- | --- |
| `POST /v1/members` | `{ "email", "role", "full_name"? }` | `201 { id, user_id, role, invited }` — `invited: true` quando a pessoa ainda não tinha conta e recebeu o e-mail de convite; `409` já é membro; `403` só owner concede owner |
| `PATCH /v1/members/:id` | `{ "role" }` | `200`; `409` ao rebaixar o último owner; `404` membro de outro tenant |
| `DELETE /v1/members/:id` | — | `204`; `409` último owner |

### Setores (admin)

| rota | corpo | respostas |
| --- | --- | --- |
| `POST /v1/departments` | `{ "name" }` | `201 { id, name }`; `409` nome repetido |
| `PATCH /v1/departments/:id` | `{ "name" }` | `200`; `404` |
| `DELETE /v1/departments/:id` | — | `204`; `409` em uso |
