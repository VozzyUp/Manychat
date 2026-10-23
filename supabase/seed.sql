-- Local development seed (runs on `supabase db reset`). Fictitious data only.
-- Users and logins are added in build step 1.3.

insert into public.partners (id, name, branding)
values (
  '00000000-0000-4000-8000-000000000001',
  'Nurion Hub Health Tech',
  '{"name": "Nurion Hub", "primary": "#0F766E"}'
)
on conflict (id) do nothing;

insert into public.tenants (id, partner_id, name, slug, branding, settings)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
   'Transportadora Demo', 'transportadora-demo', '{}',
   '{"timezone": "America/Sao_Paulo"}'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001',
   'Laboratório Demo', 'laboratorio-demo', '{}',
   '{"timezone": "America/Sao_Paulo"}')
on conflict (id) do nothing;

insert into public.tenant_modules (tenant_id, module)
values
  ('00000000-0000-4000-8000-0000000000a1', 'log'),
  ('00000000-0000-4000-8000-0000000000a1', 'consult'),
  ('00000000-0000-4000-8000-0000000000a1', 'adm'),
  ('00000000-0000-4000-8000-0000000000b1', 'labs'),
  ('00000000-0000-4000-8000-0000000000b1', 'consult')
on conflict (tenant_id, module) do nothing;

insert into public.departments (tenant_id, name)
select t.id, d.name
from public.tenants t
cross join (values ('Financeiro'), ('Qualidade'), ('Operações'), ('RH'), ('TI')) as d (name)
on conflict (tenant_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- Demo users (local only). Password for all: NurionDemo!2026
--   gestor@demo.local     owner of Transportadora Demo, admin of Laboratório Demo
--   qualidade@demo.local  quality of Transportadora Demo
--   leitor@demo.local     viewer of Transportadora Demo
--   laboratorio@demo.local owner of Laboratório Demo
--   parceiro@nurion.local partner admin (Nurion)
-- ---------------------------------------------------------------------------
with demo (id, email, full_name) as (
  values
    ('00000000-0000-4000-8000-00000000f001'::uuid, 'gestor@demo.local', 'Gestora Demo'),
    ('00000000-0000-4000-8000-00000000f002'::uuid, 'qualidade@demo.local', 'Qualidade Demo'),
    ('00000000-0000-4000-8000-00000000f003'::uuid, 'leitor@demo.local', 'Leitor Demo'),
    ('00000000-0000-4000-8000-00000000f004'::uuid, 'parceiro@nurion.local', 'Parceiro Nurion'),
    ('00000000-0000-4000-8000-00000000f005'::uuid, 'laboratorio@demo.local', 'Laboratório Demo')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('NurionDemo!2026', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', full_name),
  now(), now(), '', '', '', ''
from demo
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@demo.local' or u.email = 'parceiro@nurion.local'
on conflict do nothing;

insert into public.tenant_members (tenant_id, user_id, role)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000f001', 'owner'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000f001', 'admin'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000f002', 'quality'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000f003', 'viewer')
on conflict (tenant_id, user_id) do nothing;

insert into public.tenant_members (tenant_id, user_id, role)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000f005', 'owner')
on conflict (tenant_id, user_id) do nothing;

insert into public.partner_members (partner_id, user_id, role)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000f004', 'admin')
on conflict (partner_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Demo conversations (Transportadora Demo) so Conversas/Contatos have something to show locally.
-- The number is disabled and has no real token: nothing is ever sent from it.
-- ---------------------------------------------------------------------------
insert into public.whatsapp_numbers (id, tenant_id, phone_number_id, waba_id, display_number,
                                     access_token_enc, token_last4, default_module, status, verified_name)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1',
        '100000000000001', '100000000000002', '+55 11 4000-0001', 'demo-sem-token', 'demo',
        'log', 'disabled', 'Transportadora Demo')
on conflict (id) do nothing;

insert into public.contacts (id, tenant_id, wa_id, name, profile_name, kind)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
   '5511990000001', 'João Motorista', 'João', 'driver'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1',
   '5511990000002', null, 'Maria', 'unknown')
on conflict (id) do nothing;

insert into public.conversations (id, tenant_id, contact_id, whatsapp_number_id, module, agent_key,
                                  last_inbound_at, last_message_at)
values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', 'log',
   'log.driver', now() - interval '20 minutes', now() - interval '19 minutes'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d1', null, null,
   now() - interval '2 hours', now() - interval '2 hours')
on conflict (id) do nothing;

insert into public.messages (tenant_id, conversation_id, wamid, direction, author, type, text,
                             transcription, status, sent_at, created_at, processed_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'wamid.demo-1',
   'in', 'contact', 'text', 'Bom dia, cheguei no cliente da entrega 4512.', null, 'received',
   now() - interval '21 minutes', now() - interval '21 minutes', now() - interval '21 minutes'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'wamid.demo-2',
   'in', 'contact', 'audio', null, 'O termômetro do baú está marcando seis graus.', 'received',
   now() - interval '20 minutes', now() - interval '20 minutes', now() - interval '20 minutes'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'wamid.demo-3',
   'out', 'ai', 'text', 'Obrigado, João. Envie uma foto do termômetro e do canhoto assinado.',
   null, 'read', now() - interval '19 minutes', now() - interval '19 minutes', null),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', 'wamid.demo-4',
   'in', 'contact', 'text', 'Oi, queria saber do meu pedido.', null, 'received',
   now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', null,
   'out', 'system', 'text',
   'Olá! Não encontrei seu cadastro neste número. Vou passar sua mensagem para a nossa equipe, que responde assim que possível.',
   null, 'read', now() - interval '119 minutes', now() - interval '119 minutes', null)
on conflict do nothing;

insert into public.handoffs (tenant_id, conversation_id, reason, opened_by, opened_at)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2',
        'unidentified', 'system', now() - interval '2 hours')
on conflict do nothing;
