import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MapEditor, type EditorZone, type EditorSeat } from "@/components/dashboard/MapEditor";
import { AutoVenueAI } from "@/components/dashboard/AutoVenueAI";

export const dynamic = "force-dynamic";

export default async function MapEditorPage({ params }: { params: Promise<{ mapId: string }> }) {
  const { mapId } = await params;
  const db = await createClient();

  const { data: map } = await db
    .from("venue_maps")
    .select("id, name, status, width_m, height_m, background_url, venues_v2(name)")
    .eq("id", mapId)
    .maybeSingle<{ id: string; name: string; status: string; width_m: number; height_m: number; background_url: string | null; venues_v2: { name: string } | null }>();
  if (!map) notFound();

  const { data: zoneRows } = await db
    .from("zones_geo")
    .select("id, name, kind, color, ga_capacity, area_geojson")
    .eq("map_id", mapId);

  const { data: seatRows } = await db
    .from("venue_seats_geo")
    .select("id, zone_id, label, x, y")
    .eq("map_id", mapId);

  const zones: EditorZone[] = (zoneRows ?? []).map((z) => {
    let points: [number, number][] = [];
    try {
      const gj = JSON.parse(z.area_geojson as string);
      const ring = gj.coordinates?.[0] ?? [];
      points = ring.slice(0, -1).map((p: number[]) => [p[0], p[1]] as [number, number]); // quita cierre
    } catch {}
    return { id: z.id, name: z.name, kind: z.kind, color: z.color, gaCapacity: z.ga_capacity, points };
  });

  const seats: EditorSeat[] = (seatRows ?? []).map((s) => ({
    id: s.id, zoneId: s.zone_id, label: s.label, x: s.x, y: s.y,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/recintos" className="mb-4 flex items-center gap-2 text-sm text-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Recintos
      </Link>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">{map.venues_v2?.name ?? "Recinto"}</h1>
        <p className="text-sm text-muted">{map.name} · {map.width_m}×{map.height_m} m</p>
      </div>
      <AutoVenueAI mapId={map.id} defaultWidth={Number(map.width_m)} defaultHeight={Number(map.height_m)} hasBackground={!!map.background_url} />

      <MapEditor
        mapId={map.id}
        widthM={Number(map.width_m)}
        heightM={Number(map.height_m)}
        status={map.status}
        backgroundUrl={map.background_url}
        initialZones={zones}
        initialSeats={seats}
      />
    </div>
  );
}
