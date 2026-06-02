import Link from "next/link";
import { Plus, ExternalLink, Calendar, TrendingUp, Ticket as TicketIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";

export const dynamic = "force-dynamic";

interface EventAgg {
  id: string;
  slug: string;
  title: string;
  status: string;
  currency: string;
  starts_at: string;
  cover_image: string | null;
}

export default async function DashboardPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  const { data: events } = await db
    .from("events")
    .select("id, slug, title, status, currency, starts_at, cover_image")
    .order("starts_at", { ascending: true })
    .returns<EventAgg[]>();

  // Métricas agregadas por evento (ventas pagadas + boletos emitidos).
  const ids = (events ?? []).map((e) => e.id);
  let revenueByEvent: Record<string, number> = {};
  let ticketsByEvent: Record<string, number> = {};
  if (ids.length) {
    const { data: orders } = await db
      .from("orders")
      .select("event_id, subtotal_cents")
      .eq("status", "paid")
      .in("event_id", ids);
    for (const o of orders ?? []) revenueByEvent[o.event_id] = (revenueByEvent[o.event_id] ?? 0) + o.subtotal_cents;

    const { data: tts } = await db
      .from("ticket_types")
      .select("event_id, quantity_sold")
      .in("event_id", ids);
    for (const t of tts ?? []) ticketsByEvent[t.event_id] = (ticketsByEvent[t.event_id] ?? 0) + t.quantity_sold;
  }

  const totalRevenue = Object.values(revenueByEvent).reduce((a, b) => a + b, 0);
  const totalTickets = Object.values(ticketsByEvent).reduce((a, b) => a + b, 0);
  const currency = events?.[0]?.currency ?? "usd";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Mis eventos</h1>
          <p className="mt-1 text-sm text-muted">Hola, {user?.email}</p>
        </div>
        <Link
          href="/dashboard/new"
          className="brand-gradient flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-ink transition hover:scale-[1.03]"
        >
          <Plus className="h-4 w-4" /> Crear evento
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KPI icon={TrendingUp} label="Ventas totales" value={money(totalRevenue, currency)} />
        <KPI icon={TicketIcon} label="Boletos vendidos" value={totalTickets.toLocaleString("es-MX")} />
        <KPI icon={Calendar} label="Eventos" value={String(events?.length ?? 0)} />
      </div>

      {(!events || events.length === 0) ? (
        <div className="glass rounded-3xl p-12 text-center">
          <p className="text-muted">Aún no tienes eventos.</p>
          <Link href="/dashboard/new" className="brand-text mt-2 inline-block font-semibold">
            Crea tu primer evento →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="glass flex items-center gap-4 rounded-2xl p-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {e.cover_image && <img src={e.cover_image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-medium">{e.title}</h3>
                  <Badge status={e.status} />
                </div>
                <p className="text-sm text-muted">
                  {new Date(e.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                  {" · "}
                  {money(revenueByEvent[e.id] ?? 0, e.currency)} · {(ticketsByEvent[e.id] ?? 0).toLocaleString("es-MX")} boletos
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href={`/dashboard/eventos/${e.id}`} className="text-sm text-muted transition hover:text-fg">
                  Gestionar
                </Link>
                {e.status === "published" && (
                  <Link href={`/e/${e.slug}`} target="_blank" className="flex items-center gap-1.5 text-sm text-muted transition hover:text-fg">
                    Ver <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className="h-4 w-4 text-gold" /> {label}
      </div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: "text-emerald-300 bg-emerald-500/10",
    draft: "text-muted bg-surface-2",
    cancelled: "text-fuchsia bg-fuchsia/10",
    ended: "text-muted bg-surface-2",
  };
  const label: Record<string, string> = { published: "Publicado", draft: "Borrador", cancelled: "Cancelado", ended: "Finalizado" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-surface-2 text-muted"}`}>{label[status] ?? status}</span>;
}
