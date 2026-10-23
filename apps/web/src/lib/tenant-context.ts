import 'server-only';
import { loadTenantMemberships, type TenantMembership } from '@nurion/db/queries';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { requireUser } from './session';
import { createSupabaseServerClient } from './supabase/server';

/** All tenants of the signed-in user (RLS decides), cached per request. */
export const getMemberships = cache(async (): Promise<TenantMembership[]> => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  return loadTenantMemberships(supabase, user.id);
});

/** The tenant in the URL, if the user belongs to it; 404 otherwise (never reveal other tenants). */
export const getTenantContext = cache(async (slug: string) => {
  const memberships = await getMemberships();
  const current = memberships.find((m) => m.tenant.slug === slug);
  if (!current) notFound();
  return { ...current, memberships };
});
