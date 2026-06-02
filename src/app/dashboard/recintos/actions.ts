"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrg } from "@/lib/org";

export async function createVenueAndMap(form: { venueName: string; city: string; width: number; height: number }) {
  const db = await createClient();
  const org = await getUserOrg(db);
  if (!org) return { error: "Sin organización" };

  const { data: venue, error: vErr } = await db
    .from("venues_v2")
    .insert({ org_id: org.id, name: form.venueName.trim() || "Recinto", city: form.city || null })
    .select("id")
    .single();
  if (vErr || !venue) return { error: vErr?.message ?? "No se pudo crear el recinto" };

  const { data: map, error: mErr } = await db
    .from("venue_maps")
    .insert({ venue_id: venue.id, name: "Mapa principal", width_m: form.width, height_m: form.height })
    .select("id")
    .single();
  if (mErr || !map) return { error: mErr?.message ?? "No se pudo crear el mapa" };

  revalidatePath("/dashboard/recintos");
  return { ok: true, mapId: map.id };
}

export async function saveZone(form: {
  mapId: string; name: string; kind: string; color: string; points: [number, number][]; gaCapacity: number | null;
}) {
  const db = await createClient();
  const { data, error } = await db.rpc("save_zone", {
    p_map: form.mapId, p_name: form.name, p_kind: form.kind, p_color: form.color,
    p_points: form.points, p_ga_capacity: form.gaCapacity,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${form.mapId}`);
  return { ok: true, zoneId: data as string };
}

export async function generateZoneSeats(form: {
  mapId: string; zoneId: string; rows: number; cols: number;
  rowStart: string; seatStart: number; originX: number; originY: number; dx: number; dy: number;
}) {
  const db = await createClient();
  const { data, error } = await db.rpc("generate_zone_seats", {
    p_zone: form.zoneId, p_rows: form.rows, p_cols: form.cols,
    p_row_start: form.rowStart || "A", p_seat_start: form.seatStart || 1,
    p_origin_x: form.originX, p_origin_y: form.originY, p_dx: form.dx, p_dy: form.dy,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${form.mapId}`);
  return { ok: true, count: data as number };
}

export async function deleteZone(mapId: string, zoneId: string) {
  const db = await createClient();
  const { error } = await db.rpc("delete_zone", { p_zone: zoneId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${mapId}`);
  return { ok: true };
}

export async function publishMap(mapId: string) {
  const db = await createClient();
  const { error } = await db.rpc("publish_map", { p_map: mapId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${mapId}`);
  return { ok: true };
}
