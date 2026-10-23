-- Build step 1.2 — core multi-tenancy (ESCOPO §4.1, §9), RLS (ADR-0001) and audit trigger (ADR-0003).
--
-- Tables: partners, partner_members, profiles, tenants, tenant_modules, tenant_members,
--         departments, audit_log.
-- Every business table has tenant_id NOT NULL, RLS enabled and explicit policies.
-- Helper functions live in the private schema `app` (not exposed by PostgREST).

-- ---------------------------------------------------------------------------
-- Extensions and private schema
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- Tenant roles, ordered from least to most powerful. Enum order is used by `>=` comparisons.
create type public.app_role as enum ('viewer', 'operator', 'quality', 'manager', 'admin', 'owner');

-- ---------------------------------------------------------------------------
-- Generic triggers
-- ---------------------------------------------------------------------------
create function app.set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the current session is not an end user (service role, migrations, tests as postgres).
-- Must be called from SECURITY INVOKER code so current_user is the session role.
create function app.is_privileged() returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon');
$$;

-- ---------------------------------------------------------------------------
-- Partners (Nurion) and their staff
-- ---------------------------------------------------------------------------
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_members (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, user_id)
);
create index partner_members_user_idx on public.partner_members (user_id);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user; name shown in the panel)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function app.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create function app.handle_user_email_change() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Tenants (end customers) and what they contracted
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{"timezone": "America/Sao_Paulo"}'::jsonb,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tenants_partner_idx on public.tenants (partner_id);

create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id)
);
create index tenant_members_user_idx on public.tenant_members (user_id, tenant_id);

create table public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module text not null check (module in ('log', 'labs', 'consult', 'adm')),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name),
  unique (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- Access helpers used by policies. SECURITY DEFINER avoids RLS recursion on
-- tenant_members; empty search_path prevents function hijacking.
-- ---------------------------------------------------------------------------
create function app.is_member(p_tenant_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
  );
$$;

create function app.has_role(p_tenant_id uuid, p_min_role public.app_role) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role >= p_min_role
  );
$$;

create function app.is_partner_member(p_partner_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.partner_members pm
    where pm.partner_id = p_partner_id and pm.user_id = (select auth.uid())
  );
$$;

create function app.is_partner_admin(p_partner_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.partner_members pm
    where pm.partner_id = p_partner_id
      and pm.user_id = (select auth.uid())
      and pm.role = 'admin'
  );
$$;

-- Partner admin of the partner that owns this tenant.
create function app.is_tenant_partner_admin(p_tenant_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.tenants t
    join public.partner_members pm on pm.partner_id = t.partner_id
    where t.id = p_tenant_id
      and pm.user_id = (select auth.uid())
      and pm.role = 'admin'
  );
$$;

create function app.is_tenant_partner_member(p_tenant_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.tenants t
    join public.partner_members pm on pm.partner_id = t.partner_id
    where t.id = p_tenant_id and pm.user_id = (select auth.uid())
  );
$$;

-- Users who share at least one tenant with the current user (to show colleagues' names).
create function app.shares_tenant_with(p_user_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members mine
    join public.tenant_members theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

create function app.module_enabled(p_tenant_id uuid, p_module text) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_modules tm
    where tm.tenant_id = p_tenant_id and tm.module = p_module and tm.enabled
  );
$$;

revoke all on all functions in schema app from public;
grant execute on function
  app.is_member(uuid),
  app.has_role(uuid, public.app_role),
  app.is_partner_member(uuid),
  app.is_partner_admin(uuid),
  app.is_tenant_partner_admin(uuid),
  app.is_tenant_partner_member(uuid),
  app.shares_tenant_with(uuid),
  app.module_enabled(uuid, text),
  app.is_privileged()
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Guard triggers: rules RLS cannot express on its own
-- ---------------------------------------------------------------------------

-- Only the partner (or the platform) changes partner_id, slug and status of a tenant.
create function app.guard_tenant_update() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.is_privileged() or app.is_partner_admin(old.partner_id) then
    return new;
  end if;
  if new.partner_id is distinct from old.partner_id
     or new.slug is distinct from old.slug
     or new.status is distinct from old.status then
    raise exception 'only the partner can change partner, slug or status of a tenant'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Tenants configure module settings; only the partner turns modules on or off (contracted modules).
create function app.guard_tenant_module_update() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.is_privileged() or app.is_tenant_partner_admin(old.tenant_id) then
    return new;
  end if;
  if new.enabled is distinct from old.enabled
     or new.module is distinct from old.module
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'only the partner can enable or disable modules' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A tenant always keeps at least one owner.
create function app.guard_last_owner() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  remaining int;
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.tenant_id = old.tenant_id then
    return new;
  end if;
  -- Deleting the whole tenant cascades to members: allow it.
  if not exists (select 1 from public.tenants where id = old.tenant_id) then
    return coalesce(new, old);
  end if;
  select count(*) into remaining
  from public.tenant_members
  where tenant_id = old.tenant_id and role = 'owner' and id <> old.id;
  if remaining = 0 then
    raise exception 'a tenant must keep at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log (ESCOPO §4.8, ADR-0003). Written only by the trigger; immutable for everyone else.
-- tenant_id has no FK on purpose: the audit trail outlives deleted rows (and is purged explicitly).
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (tenant_id, entity, entity_id);

-- Trigger arguments are column names to leave out of before/after (secrets, large blobs).
create function app.audit_row_change() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_tenant uuid;
  -- TG_ARGV is NULL (not an empty array) when the trigger has no arguments.
  v_hidden text[] := coalesce(tg_argv, '{}'::text[]);
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - v_hidden;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - v_hidden;
  end if;
  -- Ignore updates that only touched updated_at.
  if tg_op = 'UPDATE' and (v_before - 'updated_at') = (v_after - 'updated_at') then
    return null;
  end if;
  if tg_table_name = 'tenants' then
    v_tenant := coalesce(v_after ->> 'id', v_before ->> 'id')::uuid;
  else
    v_tenant := coalesce(v_after ->> 'tenant_id', v_before ->> 'tenant_id')::uuid;
  end if;
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id, before, after)
  values (
    v_tenant,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(v_after ->> 'id', v_before ->> 'id')::uuid,
    v_before,
    v_after
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.partners
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.partner_members
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.tenant_members
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.tenant_modules
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.departments
  for each row execute function app.set_updated_at();

create trigger guard_tenant_update before update on public.tenants
  for each row execute function app.guard_tenant_update();
create trigger guard_tenant_module_update before update on public.tenant_modules
  for each row execute function app.guard_tenant_module_update();
create trigger guard_last_owner before update or delete on public.tenant_members
  for each row execute function app.guard_last_owner();

create trigger audit after insert or update or delete on public.tenants
  for each row execute function app.audit_row_change();
create trigger audit after insert or update or delete on public.tenant_members
  for each row execute function app.audit_row_change();
create trigger audit after insert or update or delete on public.tenant_modules
  for each row execute function app.audit_row_change();
create trigger audit after insert or update or delete on public.departments
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.partner_members enable row level security;
alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.departments enable row level security;
alter table public.audit_log enable row level security;

-- partners: visible to its staff and to members of its tenants (branding fallback).
create policy partners_select on public.partners for select to authenticated
  using (
    app.is_partner_member(id)
    or exists (select 1 from public.tenants t where t.partner_id = partners.id and app.is_member(t.id))
  );
create policy partners_update on public.partners for update to authenticated
  using (app.is_partner_admin(id))
  with check (app.is_partner_admin(id));

-- partner_members: managed by the platform (service role); staff see their own partner's list.
create policy partner_members_select on public.partner_members for select to authenticated
  using (user_id = (select auth.uid()) or app.is_partner_admin(partner_id));

-- profiles: own profile, and colleagues who share a tenant.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_tenant_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- tenants
create policy tenants_select on public.tenants for select to authenticated
  using (app.is_member(id) or app.is_partner_member(partner_id));
create policy tenants_insert on public.tenants for insert to authenticated
  with check (app.is_partner_admin(partner_id));
create policy tenants_update on public.tenants for update to authenticated
  using (app.has_role(id, 'admin') or app.is_partner_admin(partner_id))
  with check (app.has_role(id, 'admin') or app.is_partner_admin(partner_id));

-- tenant_members: admins manage members; only owners create or change owners.
create policy tenant_members_select on public.tenant_members for select to authenticated
  using (app.is_member(tenant_id) or app.is_tenant_partner_member(tenant_id));
create policy tenant_members_insert on public.tenant_members for insert to authenticated
  with check (
    app.is_tenant_partner_admin(tenant_id)
    or (app.has_role(tenant_id, 'admin') and (role <> 'owner' or app.has_role(tenant_id, 'owner')))
  );
create policy tenant_members_update on public.tenant_members for update to authenticated
  using (
    app.is_tenant_partner_admin(tenant_id)
    or (app.has_role(tenant_id, 'admin') and (role <> 'owner' or app.has_role(tenant_id, 'owner')))
  )
  with check (
    app.is_tenant_partner_admin(tenant_id)
    or (app.has_role(tenant_id, 'admin') and (role <> 'owner' or app.has_role(tenant_id, 'owner')))
  );
create policy tenant_members_delete on public.tenant_members for delete to authenticated
  using (
    app.is_tenant_partner_admin(tenant_id)
    or (app.has_role(tenant_id, 'admin') and (role <> 'owner' or app.has_role(tenant_id, 'owner')))
  );

-- tenant_modules: partner contracts modules; tenant admins tune settings (guard trigger).
create policy tenant_modules_select on public.tenant_modules for select to authenticated
  using (app.is_member(tenant_id) or app.is_tenant_partner_member(tenant_id));
create policy tenant_modules_insert on public.tenant_modules for insert to authenticated
  with check (app.is_tenant_partner_admin(tenant_id));
create policy tenant_modules_update on public.tenant_modules for update to authenticated
  using (app.is_tenant_partner_admin(tenant_id) or app.has_role(tenant_id, 'admin'))
  with check (app.is_tenant_partner_admin(tenant_id) or app.has_role(tenant_id, 'admin'));
create policy tenant_modules_delete on public.tenant_modules for delete to authenticated
  using (app.is_tenant_partner_admin(tenant_id));

-- departments
create policy departments_select on public.departments for select to authenticated
  using (app.is_member(tenant_id));
create policy departments_insert on public.departments for insert to authenticated
  with check (app.has_role(tenant_id, 'admin'));
create policy departments_update on public.departments for update to authenticated
  using (app.has_role(tenant_id, 'admin'))
  with check (app.has_role(tenant_id, 'admin'));
create policy departments_delete on public.departments for delete to authenticated
  using (app.has_role(tenant_id, 'admin'));

-- audit_log: read by managers and up; nobody writes or changes it through the API.
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.has_role(tenant_id, 'manager'));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated, service_role;

-- The panel never uses the anon role for data.
revoke all on
  public.partners, public.partner_members, public.profiles, public.tenants,
  public.tenant_members, public.tenant_modules, public.departments, public.audit_log
from anon;
