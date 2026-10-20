# ManyChat próprio

Automação de conversas para **Instagram**, **Messenger** e **WhatsApp**, usando as APIs oficiais da Meta.

O que já faz:

- **Gatilhos:** palavra-chave na DM, comentário em post (com filtro por palavra e por post), primeira mensagem do contato, resposta padrão.
- **Passos do fluxo:** mensagem, mensagem com botões, aguardar X minutos, esperar resposta e salvar num campo, adicionar/remover tag, definir campo, condição por tag, ir para passo, fim.
- **Comentário → DM:** resposta privada no direct e resposta pública opcional no comentário.
- **Painel:** fluxos, contatos (tags, campos, conversa e resposta manual) e canais. Protegido por senha.
- Variáveis nas mensagens: `{{first_name}}`, `{{name}}`, `{{qualquer_campo}}`.
- Assinatura do webhook validada, eventos repetidos ignorados, janela de 24h da Meta respeitada.

Stack: Next.js 15 + Supabase (Postgres). Feito para rodar na Vercel.

## Como funciona

```
Meta ──webhook──> /api/webhooks/meta ──> motor de fluxos ──> Graph API (envia)
                                              │
Vercel Cron (1/min) ──> /api/cron/tick ───────┘ (retoma passos "Aguardar")
```

- `src/lib/meta/parse.ts`: transforma o webhook dos 3 canais num evento só.
- `src/lib/engine.ts`: escolhe o fluxo e executa os passos.
- `src/lib/meta/send.ts`: envia no formato de cada canal.
- `supabase/migrations/0001_init.sql`: tabelas.

## Instalação

1. **Supabase:** crie um projeto e rode `supabase/migrations/0001_init.sql` no SQL Editor.
2. **Variáveis:** copie `.env.example` para `.env.local` e preencha.
3. **Rodar local:** `npm install && npm run dev`. Para a Meta alcançar seu PC, use um túnel (ex.: `ngrok http 3000`).
4. **Deploy:** suba na Vercel com as mesmas variáveis. O `vercel.json` já agenda o cron a cada minuto. No plano Hobby a Vercel só permite cron diário; nesse caso use um agendador externo chamando `/api/cron/tick` com `Authorization: Bearer $CRON_SECRET`.

## Configurar a Meta

Crie um app em [developers.facebook.com](https://developers.facebook.com) (tipo *Business*).

Em todos os canais, o webhook é o mesmo:
- **URL:** `https://SEU-DOMINIO/api/webhooks/meta`
- **Token de verificação:** o valor de `META_VERIFY_TOKEN`
- Coloque o **app secret** em `META_APP_SECRETS`. O produto Instagram (login do Instagram) tem um app secret próprio: coloque os dois, separados por vírgula.

### Instagram
1. A conta precisa ser **profissional** (comercial ou criador).
2. Adicione o produto *Instagram* → *API com login do Instagram* e gere o token da conta.
3. Assine os campos de webhook `messages`, `messaging_postbacks` e `comments`.
4. No painel, em **Canais**: tipo Instagram, ID da conta IG e o token.

### Messenger
1. Adicione o produto *Messenger*, conecte a página e gere o token da página.
2. Assine `messages`, `messaging_postbacks` e `feed` (para comentários).
3. Em **Canais**: tipo Messenger, ID da página e o token.

### WhatsApp
1. Adicione o produto *WhatsApp*. Pegue o **Phone number ID** e crie um token permanente (usuário do sistema no Business Manager).
2. Assine o campo `messages`.
3. Em **Canais**: tipo WhatsApp, phone number ID e o token.

Para pessoas fora da lista de testadores do app usarem, o app precisa passar pela **revisão da Meta** com as permissões `instagram_business_manage_messages`, `instagram_business_manage_comments`, `pages_messaging`, `pages_manage_engagement` e `whatsapp_business_messaging`.

## Regras da Meta que o sistema respeita

- **Janela de 24h:** só dá para mandar mensagem livre até 24h depois da última mensagem do contato. Fora disso o envio é bloqueado e aparece como falha na conversa. No WhatsApp, fora da janela, só com *template* aprovado (ainda não implementado).
- **Comentário:** a Meta permite **uma** mensagem privada por comentário. Para continuar a conversa, comece o fluxo com *Mensagem com botões*: quando a pessoa clica, a janela abre e o fluxo segue.
- **Botões:** até 20 caracteres. Até 3 botões aparecem como botões; acima disso, viram lista (WhatsApp) ou respostas rápidas (Instagram/Messenger).

## Testes

```
npm test        # parser dos webhooks, assinatura e motor de fluxos
npm run lint    # checagem de tipos
```

## Próximos passos sugeridos

- Templates do WhatsApp (mensagens fora da janela de 24h) e disparos em massa.
- Construtor visual de arrastar e soltar.
- Imagens e áudio nas mensagens.
- Login com Supabase Auth e várias contas/empresas.
- Criptografar os tokens dos canais no banco.
