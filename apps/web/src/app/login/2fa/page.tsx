import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { getSessionUser, safeNext } from '@/lib/session';
import { AuthCard } from '../auth-card';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Verificação em duas etapas · Nurion Hub' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.needsSecondFactor) redirect(safeNext(next));

  return (
    <AuthCard
      title="Verificação em duas etapas"
      subtitle="Abra o aplicativo autenticador e digite o código atual."
    >
      <TwoFactorForm next={next} />
      <form action={signOut}>
        <button type="submit" className="w-full text-center text-sm text-muted hover:underline">
          Entrar com outra conta
        </button>
      </form>
    </AuthCard>
  );
}
