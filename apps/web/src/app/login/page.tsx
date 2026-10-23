import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { getSessionUser, safeNext } from '@/lib/session';
import { AuthCard } from './auth-card';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar · Nurion Hub' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;
  const user = await getSessionUser();
  if (user && !user.needsSecondFactor) redirect(safeNext(next));

  return (
    <AuthCard title="Entrar" subtitle="Use o e-mail e a senha do seu acesso ao painel.">
      {erro === 'link' ? (
        <Alert tone="error">O link expirou ou já foi usado. Peça um novo.</Alert>
      ) : null}
      <LoginForm next={next} />
    </AuthCard>
  );
}
