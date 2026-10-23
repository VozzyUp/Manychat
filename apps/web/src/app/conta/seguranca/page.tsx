import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/card';
import { requireUser, safeNext } from '@/lib/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { TwoFactorSetup } from './two-factor-setup';

export const metadata: Metadata = { title: 'Segurança da conta · Nurion Hub' };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await requireUser('/conta/seguranca');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp.find((f) => f.status === 'verified') ?? null;

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Link href={safeNext(next)} className="text-sm font-medium text-accent-text hover:underline">
        ← Voltar ao painel
      </Link>
      <h1 className="text-2xl font-bold text-text">Segurança da conta</h1>
      <p className="text-sm text-muted">{user.email}</p>
      <Card>
        <CardTitle>Verificação em duas etapas</CardTitle>
        <TwoFactorSetup factorId={factor?.id ?? null} />
      </Card>
    </main>
  );
}
