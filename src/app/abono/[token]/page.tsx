import { notFound } from "next/navigation";
import Link from "next/link";
import { Layers, QrCode, ShieldCheck, Calendar } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi abono | ShaarPass", robots: { index: false } };

interface TicketRow {
  qr_token: string;
  status: string;
  events: { title: string; starts_at: string; city: string | null; region: string | null } | null;
}

export default async function AccountManager({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // manage_token es un bearer secreto → lectura con service role (no expone RLS).
  const db = createAdminClient();

  const { data: order } = await db
    .from("orders")
    .select("id, buyer_email, status, seasons(title, currency)")
    .eq("manage_token", token)
    .maybeSingle<{ id: string; buyer_email: string; status: string; seasons: { title: string; currency: string } | null }>();
  if (!order) notFound();

  const { data: tickets } = await db
    .from("tickets")
    .select("qr_token, status, events(title, starts_at, city, region)")
    .eq("order_id", order.id)
    .returns<TicketRow[]>();

  const rows = (tickets ?? []).slice().sort((a, b) => {
    const ta = a.events?.starts_at ?? "", tb = b.events?.starts_at ?? "";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gold"><Layers className="h-4 w-4" /> Mi abono</div>
      <h1 className="font-display text-3xl font-bold">{order.seasons?.title ?? "Abono"}</h1>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
        <ShieldCheck className="h-4 w-4 text-gold" /> {rows.length} {rows.length === 1 ? "boleto" : "boletos"} · cada uno con QR seguro, transferible y revendible
      </p>

      {order.status !== "paid" && (
        <div className="glass mt-6 rounded-2xl border border-fuchsia/20 p-4 text-sm text-fuchsia">
          Tu pago aún se está procesando. Tus boletos aparecerán aquí en cuanto se confirme.
        </div>
      )}

      <div className="mt-6 space-y-2">
        {rows.map((t) => {
          const e = t.events;
          const place = [e?.city, e?.region].filter(Boolean).join(", ");
          return (
            <Link key={t.qr_token} href={`/t/${t.qr_token}`}
              className="glass flex items-center justify-between rounded-2xl border border-line px-4 py-3.5 transition hover:border-white/20">
              <div>
                <div className="font-medium">{e?.title ?? "Evento"}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  {e ? new Date(e.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : ""}
                  {place && <span>· {place}</span>}
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-sm text-gold">
                <QrCode className="h-4 w-4" /> Ver boleto
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
