import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "ManyChat próprio", description: "Automação de Instagram, Messenger e WhatsApp" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
