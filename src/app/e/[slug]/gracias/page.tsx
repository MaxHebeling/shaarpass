import Link from "next/link";
import { CheckCircle2, Calendar, Mail } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";

function fmtWhen(iso: string, tz: string) {
  try {
    return new Date(iso).toLocaleString("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz || "America/Mexico_City" });
  } catch { return ""; }
}

export default async function GraciasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createPublicClient();
  const { data: event } = await db
    .from("events")
    .select("title, cover_image, starts_at, timezone")
    .eq("slug", slug)
    .maybeSingle();

  return (
    <main className="aurora relative grid min-h-screen place-items-center px-5 py-12 text-center">
      <div className="relative z-10 w-full max-w-md">
        <div className="brand-gradient mx-auto grid h-16 w-16 place-items-center rounded-2xl text-ink shadow-xl shadow-fuchsia/30">
          <CheckCircle2 className="h-8 w-8" strokeWidth={2.4} />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold sm:text-4xl">¡Listo! 🎉</h1>
        <p className="mx-auto mt-3 max-w-sm text-muted">
          Tu compra se procesó. Te enviamos los boletos con su código QR a tu correo.
        </p>

        {/* Sección visual del evento */}
        {event && (
          <div className="glass mt-7 overflow-hidden rounded-3xl text-left">
            {event.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.cover_image} alt={event.title} className="aspect-[16/9] w-full object-cover" />
            )}
            <div className="p-5">
              <div className="font-display text-lg font-semibold leading-tight">{event.title}</div>
              {event.starts_at && (
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="capitalize">{fmtWhen(event.starts_at, event.timezone)}</span>
                </div>
              )}
              <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-surface/60 px-3 py-2 text-xs text-muted">
                <Mail className="h-3.5 w-3.5 shrink-0 text-gold" /> Revisa tu correo: ahí está tu QR y el botón “Ver mi boleto”.
              </div>
            </div>
          </div>
        )}

        <Link href={`/e/${slug}`} className="brand-text mt-7 inline-block font-semibold">
          Ver diseño del evento →
        </Link>
      </div>
    </main>
  );
}
