import type { ReactNode } from "react";
import Link from "next/link";
import { Ticket, LayoutDashboard, Plus, LogOut, Wallet, ScanLine, Map, Layers, Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-ink-2/50 p-5 md:flex">
        <Link href="/dashboard" className="mb-8 flex items-center gap-2 font-display text-lg font-bold">
          <span className="brand-gradient grid h-8 w-8 place-items-center rounded-xl text-ink">
            <Ticket className="h-4 w-4" strokeWidth={2.5} />
          </span>
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
          <div className="mb-2 truncate px-3 text-xs text-muted">{user?.email}</div>
          <form action={signOut}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-surface hover:text-fg">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
