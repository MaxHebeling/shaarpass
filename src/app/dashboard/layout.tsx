import type { ReactNode } from "react";
import Link from "next/link";
import { LayoutDashboard, Plus, LogOut, Wallet, ScanLine, Map, Layers, Palette, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

function displayNameFrom(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): string {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name as string) || (meta.name as string);
  if (full) return full;
  const local = user?.email?.split("@")[0];
  if (!local) return "Mi cuenta";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const displayName = displayNameFrom(user);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-ink-2/50 p-5 md:flex">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 font-display text-lg font-bold">
          <img src="/logo-mark.png" alt="ShaarPass" className="h-9 w-9 rounded-xl" />
          ShaarPass
        </Link>

        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <LayoutDashboard className="h-4 w-4" /> Mis eventos
          </Link>
          <Link href="/dashboard/new" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <Plus className="h-4 w-4" /> Crear evento
          </Link>
          <Link href="/dashboard/recintos" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <Map className="h-4 w-4" /> Recintos
          </Link>
          <Link href="/dashboard/arquitecto" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <Sparkles className="h-4 w-4" /> Arquitecto IA
          </Link>
          <Link href="/dashboard/abonos" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <Layers className="h-4 w-4" /> Abonos
          </Link>
          <Link href="/dashboard/marca" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <Palette className="h-4 w-4" /> Mi marca
          </Link>
          <Link href="/dashboard/checkin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <ScanLine className="h-4 w-4" /> Check-in
          </Link>
          <Link href="/dashboard/pagos" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-muted transition hover:bg-surface hover:text-fg">
            <Wallet className="h-4 w-4" /> Pagos
          </Link>
        </nav>

        <div className="mt-auto">
          {/* Encabezado de perfil: logo de marca centrado, encima del usuario y correo */}
          <div className="rounded-2xl border border-line bg-surface/40 p-4 text-center">
            <img src="/logo-mark.png" alt="ShaarPass" className="mx-auto h-12 w-12 rounded-2xl object-contain shadow-lg shadow-fuchsia/20" />
            <div className="mt-3 truncate font-medium leading-tight text-fg">{displayName}</div>
            <div className="mt-0.5 truncate text-xs text-muted">{user?.email}</div>
          </div>
          <form action={signOut} className="mt-2">
            <button className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface hover:text-fg">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 md:px-10">
        {/* Encabezado de perfil en móvil (el sidebar se oculta): marca centrada */}
        <header className="mb-7 flex flex-col items-center gap-3 border-b border-line pb-6 text-center md:hidden">
          <img src="/logo-mark.png" alt="ShaarPass" className="h-16 w-16 rounded-2xl object-contain shadow-lg shadow-fuchsia/20" />
          <div>
            <div className="font-display text-lg font-semibold leading-tight text-fg">{displayName}</div>
            <div className="mt-0.5 text-sm text-muted">{user?.email}</div>
          </div>
          <form action={signOut}>
            <button className="flex items-center gap-2 rounded-full border border-line px-4 py-1.5 text-xs text-muted transition hover:bg-surface hover:text-fg">
              <LogOut className="h-3.5 w-3.5" /> Salir
            </button>
          </form>
        </header>
        {children}
      </main>
    </div>
  );
}
