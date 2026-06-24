import Link from "next/link";
import { Layers, Plus, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { CreateSeasonForm } from "@/components/dashboard/CreateSeasonForm";

export const dynamic = "force-dynamic";

export default async function AbonosPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  // Solo abonos de las organizaciones del usuario (la RLS permite leer los publicados).
  const { data: memberships } = await db.from("org_members").select("org_id").eq("user_id", user?.id ?? "");
  const orgIds = (memberships ?? []).map((m) => m.org_id);

  const { data: seasons } = orgIds.length
    ? await db
        .from("seasons")
        .select("id, slug, title, currency, price_cents, quantity_total, quantity_sold, status")
        .in("org_id", orgIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center gap-2">
        <Layers className="h-6 w-6 text-gold" />
        <h1 className="font-display text-3xl font-bold">Abonos de temporada</h1>
      </div>

      <p className="mb-6 text-sm text-muted">
        Agrupa varios eventos en un solo pase. El comprador paga una vez y recibe un boleto seguro para cada evento.
      </p>

      <div className="mb-8">
        <CreateSeasonForm />
      </div>

      <div className="space-y-2">
        {(seasons ?? []).length === 0 && <p className="text-sm text-muted">Aún no tienes abonos.</p>}
        {(seasons ?? []).map((s) => (
          <div key={s.id} className="glass flex items-center justify-between rounded-2xl border border-line px-4 py-3.5">
            <div>
              <Link href={`/dashboard/abonos/${s.id}`} className="font-medium transition hover:text-gold">{s.title}</Link>
              <div className="mt-0.5 text-xs text-muted">
                {money(s.price_cents, s.currency)} · {s.quantity_sold}/{s.quantity_total} vendidos ·{" "}
                <span className={s.status === "published" ? "text-emerald-400" : "text-muted"}>
                  {s.status === "published" ? "Publicado" : "Borrador"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {s.status === "published" && (
                <Link href={`/s/${s.slug}`} target="_blank" className="text-muted transition hover:text-fg"><ExternalLink className="h-4 w-4" /></Link>
              )}
              <Link href={`/dashboard/abonos/${s.id}`} className="text-sm text-gold">Gestionar</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
