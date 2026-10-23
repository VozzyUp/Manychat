import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-bold text-text">Página não encontrada</h1>
      <p className="text-sm text-muted">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/tenants" className="font-medium text-accent-text hover:underline">
        Ir para o início
      </Link>
    </main>
  );
}
