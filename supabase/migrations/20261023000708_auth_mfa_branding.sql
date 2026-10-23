-- Build step 1.3 — auth and white-label panel.
--
-- 1. Optional 2FA that actually protects data: a user who enrolled a TOTP factor only reaches
--    tenant data with a session that passed 2FA (aal2). Enforced inside every access helper,
--    so all RLS policies inherit it — including direct PostgREST calls.
-- 2. Foreign keys from member tables to profiles, so lists can embed names and e-mails.
-- 3. Public bucket for tenant/partner logos (no sensitive data; served to <img> tags).

-- ---------------------------------------------------------------------------
-- 1. MFA
-- ---------------------------------------------------------------------------
create function app.mfa_ok() returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if v_uid is null then
    return true;
  end if;
  if coalesce(v_claims ->> 'aal', 'aal1') = 'aal2' then
    return true;
  end if;
  -- Without the Auth service (bare database), there are no factors to check.
  if to_regclass('auth.mfa_factors') is null then
    return true;
  end if;
  return not exists (
    select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified'
  );
end;
$$;

grant execute on function app.mfa_ok() to authenticated, service_role;

create or replace function app.is_member(p_tenant_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.has_role(p_tenant_id uuid, p_min_role public.app_role) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.role >= p_min_role
  );
$$;

create or replace function app.is_partner_member(p_partner_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1 from public.partner_members pm
    where pm.partner_id = p_partner_id and pm.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_partner_admin(p_partner_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1 from public.partner_members pm
    where pm.partner_id = p_partner_id
      and pm.user_id = (select auth.uid())
      and pm.role = 'admin'
  );
$$;

create or replace function app.is_tenant_partner_admin(p_tenant_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1
    from public.tenants t
    join public.partner_members pm on pm.partner_id = t.partner_id
    where t.id = p_tenant_id
      and pm.user_id = (select auth.uid())
      and pm.role = 'admin'
  );
$$;

create or replace function app.is_tenant_partner_member(p_tenant_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1
    from public.tenants t
    join public.partner_members pm on pm.partner_id = t.partner_id
    where t.id = p_tenant_id and pm.user_id = (select auth.uid())
  );
$$;

create or replace function app.shares_tenant_with(p_user_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select app.mfa_ok() and exists (
    select 1
    from public.tenant_members mine
    join public.tenant_members theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Embeddable profiles
-- ---------------------------------------------------------------------------
alter table public.tenant_members
  add constraint tenant_members_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.partner_members
  add constraint partner_members_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. Logo bucket (public read; only the API writes, with the service role, inside <tenant>/)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
