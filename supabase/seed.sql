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
