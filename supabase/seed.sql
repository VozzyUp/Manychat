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
