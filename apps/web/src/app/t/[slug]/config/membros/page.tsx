import { roleAtLeast } from '@nurion/shared';
import type { Metadata } from 'next';
import { Card, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTenantContext } from '@/lib/tenant-context';
import { InviteForm, MemberRow } from './member-forms';

export const metadata: Metadata = { title: 'Equipe · Nurion Hub' };

/** S20 — members and roles. */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { tenant, role } = await getTenantContext(slug);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('tenant_members')
    .select('id, user_id, role, created_at, profile:profiles(full_name, email)')
    .eq('tenant_id', tenant.id)
    .order('created_at');

  const canManage = roleAtLeast(role, 'admin') && tenant.status === 'active';
  const members = (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    name: m.profile?.full_name || m.profile?.email?.split('@')[0] || 'Sem nome',
    email: m.profile?.email ?? '',
  }));

  return (
    <div className="space-y-6">
      {canManage ? (
        <Card>
          <CardTitle description="A pessoa recebe um e-mail para criar a senha.">
            Convidar pessoa
          </CardTitle>
          <InviteForm slug={slug} myRole={role} />
        </Card>
      ) : null}
      <Card>
        <CardTitle
          description={`${members.length} ${members.length === 1 ? 'pessoa' : 'pessoas'} com acesso.`}
        >
          Equipe
        </CardTitle>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              slug={slug}
              member={m}
              myRole={role}
              isMe={m.userId === user.id}
              canManage={canManage}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}
