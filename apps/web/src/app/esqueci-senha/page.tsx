import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../login/auth-card';
import { ForgotForm } from './forgot-form';

export const metadata: Metadata = { title: 'Esqueci minha senha · Nurion Hub' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Esqueci minha senha"
      subtitle="Vamos enviar um link para você criar uma nova senha."
    >
      <ForgotForm />
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-accent-text hover:underline">
          Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
