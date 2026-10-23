import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { AuthCard } from '../login/auth-card';
import { PasswordForm } from './password-form';

export const metadata: Metadata = { title: 'Definir senha · Nurion Hub' };

export default async function SetPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?erro=link');
  return (
    <AuthCard title="Crie sua senha" subtitle={user.email ?? undefined}>
      <PasswordForm />
    </AuthCard>
  );
}
