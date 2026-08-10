import Link from "next/link";
import { Plus, ExternalLink, Calendar, TrendingUp, Ticket as TicketIcon, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/money";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";

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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const { onboarding } = await searchParams;
  const forceOnboarding = onboarding === "1"; // vista previa: /dashboard?onboarding=1
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  // Solo los eventos de las organizaciones del usuario (aislamiento multi-tenant).
  // La RLS permite leer eventos publicados a cualquiera (páginas públicas), así que
  // aquí filtramos explícitamente por org para que el dashboard sea solo "lo tuyo".
  const { data: memberships } = await db
    .from("org_members")
    .select("org_id")
    .eq("user_id", user?.id ?? "");
  const orgIds = (memberships ?? []).map((m) => m.org_id);

  let events: EventAgg[] = [];
  if (orgIds.length) {
    const { data } = await db
      .from("events")
      .select("id, slug, title, status, currency, starts_at, cover_image")
      .in("org_id", orgIds)
      .order("starts_at", { ascending: true })
      .returns<EventAgg[]>();
    events = data ?? [];
  }

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

  // Estado de onboarding (guía de primeros pasos para organizadores nuevos).
  const hasEvent = events.length > 0;
  const hasPublished = events.some((e) => e.status === "published");
  const hasCover = events.some((e) => !!e.cover_image);
  let hasTickets = false, payoutsEnabled = false;
  if (ids.length) {
    const { count: ttCount } = await db.from("ticket_types").select("id", { count: "exact", head: true }).in("event_id", ids);
    hasTickets = (ttCount ?? 0) > 0;
  }
  if (orgIds.length) {
    const { data: org } = await db.from("organizations").select("stripe_account_id, payouts_enabled").eq("id", orgIds[0]).maybeSingle();
    payoutsEnabled = !!(org?.stripe_account_id && org?.payouts_enabled);
  }

  // ¿Hay eventos PUBLICADOS con boletos de PAGO? Si sí y aún no hay pagos conectados,
  // esos eventos NO pueden cobrar: el checkout devuelve 409 al comprador. Avisar fuerte.
  let hasPaidPublished = false;
  const publishedIds = events.filter((e) => e.status === "published").map((e) => e.id);
  if (publishedIds.length) {
    const { count } = await db
      .from("ticket_types")
      .select("id", { count: "exact", head: true })
      .in("event_id", publishedIds)
      .gt("price_cents", 0);
    hasPaidPublished = (count ?? 0) > 0;
  }
  const needsPayments = hasPaidPublished && !payoutsEnabled;

  const onboarded = hasPublished && hasTickets;
  const manageHref = events[0] ? `/dashboard/eventos/${events[0].id}` : null;

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

      {needsPayments && (
        <Link
          href="/dashboard/pagos"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 transition hover:bg-amber-500/15"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-fg">Conecta tus pagos para poder cobrar</p>
            <p className="mt-0.5 text-sm text-muted">
              Tienes eventos de pago publicados, pero aún no reciben dinero: el checkout rechazará las
              compras hasta que conectes tu cuenta.{" "}
              <span className="font-medium text-amber-300">Conectar ahora →</span>
            </p>
          </div>
        </Link>
      )}

      {(!onboarded || forceOnboarding) && (
        <OnboardingChecklist
          hasEvent={hasEvent} hasTickets={hasTickets} hasCover={hasCover}
          payoutsEnabled={payoutsEnabled} hasPublished={hasPublished} manageHref={manageHref}
        />
      )}

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
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Tus eventos</h2>
            <span className="text-sm text-muted">{events.length} {events.length === 1 ? "evento" : "eventos"}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <div key={e.id} className="glass overflow-hidden rounded-2xl transition hover:border-white/15">
                <Link href={`/dashboard/eventos/${e.id}`} className="block">
                  <div className="relative aspect-[16/9] w-full bg-surface-2">
                    {e.cover_image
                      ? <img src={e.cover_image} alt="" className="h-full w-full object-cover" />
                      : <div className="grid h-full place-items-center text-muted"><Calendar className="h-7 w-7" /></div>}
                    <span className="absolute right-2 top-2"><Badge status={e.status} /></span>
                  </div>
                </Link>
                <div className="p-4">
                  <h3 className="truncate font-medium">{e.title}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(e.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <span className="font-display font-bold text-gold">{money(revenueByEvent[e.id] ?? 0, e.currency)}</span>
                    <span className="text-muted">{(ticketsByEvent[e.id] ?? 0).toLocaleString("es-MX")} boletos</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
                    <Link href={`/dashboard/eventos/${e.id}`} className="font-medium text-fg transition hover:text-fuchsia">Gestionar</Link>
                    {e.status === "published" && (
                      <Link href={`/e/${e.slug}`} target="_blank" className="flex items-center gap-1.5 text-muted transition hover:text-fg">
                        Ver <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
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
