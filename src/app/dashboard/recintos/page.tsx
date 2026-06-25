import Link from "next/link";
import { MapPin, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateVenue } from "@/components/dashboard/CreateVenue";
import { DeleteVenueButton } from "@/components/dashboard/DeleteVenueButton";

export const dynamic = "force-dynamic";

interface VenueRow {
  id: string; name: string; city: string | null;
  venue_maps: { id: string; name: string; status: string }[];
}

export default async function RecintosPage() {
  const db = await createClient();
  const { data: venues } = await db
    .from("venues_v2")
    .select("id, name, city, venue_maps(id, name, status)")
    .order("created_at", { ascending: false })
    .returns<VenueRow[]>();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Recintos</h1>
          <p className="mt-1 text-sm text-muted">Captura y dibuja el mapa de tus venues, reutilizable entre eventos.</p>
        </div>
        <CreateVenue />
      </div>

      {(!venues || venues.length === 0) ? (
        <div className="glass rounded-3xl p-12 text-center text-muted">
          Aún no tienes recintos. Crea uno para dibujar su mapa de asientos.
        </div>
      ) : (
        <div className="space-y-3">
          {venues.map((v) => (
            <div key={v.id} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-gold" />
                  <h3 className="truncate font-medium">{v.name}</h3>
                  {v.city && <span className="truncate text-sm text-muted">· {v.city}</span>}
                </div>
                <DeleteVenueButton venueId={v.id} name={v.name} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {v.venue_maps.map((m) => (
                  <Link key={m.id} href={`/dashboard/recintos/${m.id}`}
                    className="flex items-center gap-2 rounded-xl border border-line bg-surface/40 px-3 py-2 text-sm transition hover:border-fuchsia/40">
                    {m.name}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${m.status === "published" ? "bg-emerald-500/10 text-emerald-300" : "bg-surface-2 text-muted"}`}>
                      {m.status === "published" ? "Publicado" : "Borrador"}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
