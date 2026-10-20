import Link from "next/link";
import { logout } from "../actions";

const links = [
  { href: "/", label: "Início" },
  { href: "/flows", label: "Fluxos" },
  { href: "/contacts", label: "Contatos" },
  { href: "/channels", label: "Canais" },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-1 px-4 py-3">
          <span className="mr-3 font-semibold text-indigo-600">ManyChat</span>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100">
              {l.label}
            </Link>
          ))}
          <form action={logout} className="ml-auto">
            <button className="text-sm text-zinc-500 hover:text-zinc-900">Sair</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
