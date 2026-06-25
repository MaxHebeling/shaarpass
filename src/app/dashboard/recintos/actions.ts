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

export async function setMapBackground(mapId: string, url: string) {
  const db = await createClient();
  const { error } = await db.from("venue_maps").update({ background_url: url }).eq("id", mapId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${mapId}`);
  return { ok: true };
}

export async function recalibrateMap(mapId: string, factor: number) {
  const db = await createClient();
  const { error } = await db.rpc("recalibrate_map", { p_map: mapId, p_factor: factor });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${mapId}`);
  return { ok: true };
}

export async function autoGenerateLayout(form: {
  mapId: string; widthM: number; lengthM: number; unit: "m" | "ft";
  totalChairs: number; perRow: number; seatGap: number; rowGap: number;
  centralAisle: boolean; lateralAisles: boolean;
}) {
  const db = await createClient();
  const { computeLayout } = await import("@/lib/venue/autoLayout");
  const f = form.unit === "ft" ? 0.3048 : 1;
  const layout = computeLayout({
    widthM: form.widthM * f, lengthM: form.lengthM * f,
    totalChairs: form.totalChairs, perRow: form.perRow,
    seatGap: form.seatGap * f, rowGap: form.rowGap * f,
    centralAisle: form.centralAisle, lateralAisles: form.lateralAisles,
  });

  // Escala el mapa a las medidas reales.
  await db.from("venue_maps").update({ width_m: layout.widthM, height_m: layout.lengthM }).eq("id", form.mapId);

  // Limpia zonas previas (regenerar / optimizar reemplaza la propuesta).
  const { data: existing } = await db.from("zones").select("id").eq("map_id", form.mapId);
  for (const z of existing ?? []) await db.rpc("delete_zone", { p_zone: z.id });

  // Bloques de sillas (zona 'seated' + asientos en grilla).
  for (const b of layout.blocks) {
    if (b.cols < 1 || b.rows < 1) continue;
    const { data: zoneId, error } = await db.rpc("save_zone", { p_map: form.mapId, p_name: b.name, p_kind: "seated", p_color: b.color, p_points: b.points, p_ga_capacity: null });
    if (error) return { error: error.message };
    if (zoneId) {
      const { error: sErr } = await db.rpc("generate_zone_seats", { p_zone: zoneId, p_rows: b.rows, p_cols: b.cols, p_row_start: "A", p_seat_start: 1, p_origin_x: b.originX, p_origin_y: b.originY, p_dx: b.dx, p_dy: b.dy });
      if (sErr) return { error: sErr.message };
    }
  }
  // Áreas sugeridas (zonas 'ga' etiquetadas, editables).
  for (const a of layout.areas) {
    const { error } = await db.rpc("save_zone", { p_map: form.mapId, p_name: a.name, p_kind: "ga", p_color: a.color, p_points: a.points, p_ga_capacity: null });
    if (error) return { error: error.message };
  }

  revalidatePath(`/dashboard/recintos/${form.mapId}`);
  return { ok: true, summary: layout.summary };
}

export interface AIZone { name: string; kind: string; color: string; x: number; y: number; w: number; h: number; }

/** Materializa un diseño generado por IA: crea zonas (y llena las 'seated' de sillas). */
export async function materializeAILayout(form: { mapId: string; widthM: number; lengthM: number; zones: AIZone[]; replace: boolean }) {
  const db = await createClient();
  const W = Math.max(4, form.widthM), L = Math.max(4, form.lengthM);
  if (form.replace) {
    await db.from("venue_maps").update({ width_m: W, height_m: L }).eq("id", form.mapId);
    const { data: existing } = await db.from("zones").select("id").eq("map_id", form.mapId);
    for (const z of existing ?? []) await db.rpc("delete_zone", { p_zone: z.id });
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const VALID = new Set(["seated", "ga", "table"]);
  for (const z of form.zones ?? []) {
    const kind = VALID.has(z.kind) ? z.kind : "ga";
    const x = clamp(Number(z.x) || 0, 0, W - 0.5), y = clamp(Number(z.y) || 0, 0, L - 0.5);
    const w = clamp(Number(z.w) || 2, 0.5, W - x), h = clamp(Number(z.h) || 2, 0.5, L - y);
    const points: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const { data: zoneId, error } = await db.rpc("save_zone", { p_map: form.mapId, p_name: z.name?.slice(0, 60) || "Zona", p_kind: kind, p_color: z.color || "#7c3aed", p_points: points, p_ga_capacity: null });
    if (error) return { error: error.message };
    if (kind === "seated" && zoneId) {
      const rows = Math.max(1, Math.floor(h / 0.9) + 1), cols = Math.max(1, Math.floor(w / 0.55) + 1);
      await db.rpc("generate_zone_seats", { p_zone: zoneId, p_rows: rows, p_cols: cols, p_row_start: "A", p_seat_start: 1, p_origin_x: x + 0.275, p_origin_y: y + 0.45, p_dx: 0.55, p_dy: 0.9 });
    }
  }
  revalidatePath(`/dashboard/recintos/${form.mapId}`);
  return { ok: true };
}

export async function deleteVenue(venueId: string) {
  const db = await createClient();
  const { error } = await db.rpc("delete_venue", { p_venue: venueId });
  if (error) return { error: error.message.includes("EN_USO") ? "Este recinto está asignado a un evento. Quítalo del evento antes de eliminarlo." : error.message };
  revalidatePath("/dashboard/recintos");
  return { ok: true };
}

export async function publishMap(mapId: string) {
  const db = await createClient();
  const { error } = await db.rpc("publish_map", { p_map: mapId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/recintos/${mapId}`);
  return { ok: true };
}
