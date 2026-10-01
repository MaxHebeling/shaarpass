"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecipients, processNotificationJob, type FieldChange, type ChangePayload } from "@/lib/notifications/eventChange";
import { parseCustomFields } from "@/lib/ticketing/customFields";
import type { Segment } from "@/lib/email/campaignSend";
import { validatePhases, linkSalePhase, type PhaseInput } from "@/lib/ticketing/pricing";
import { eventBounds, validateDays, type EventDayInput } from "@/lib/ticketing/schedule";

/** Guarda la definición de campos de registro personalizados de un evento.
 *  RLS (event_org_write) garantiza que solo un miembro de la org pueda editarlo. */
export async function updateEventCustomFields(eventId: string, fields: unknown): Promise<{ ok?: true; error?: string }> {
  const db = await createClient();
  const clean = parseCustomFields(fields);
  const { error } = await db.from("events").update({ custom_fields: clean }).eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export interface TicketTypeInput {
  name: string;
  price: number; // precio de VENTA en unidades de moneda (compat / base)
  quantity: number;
  /** Fases de precio (1 = solo venta; 2 = preventa + venta). Precio en CENTAVOS. */
  phases?: PhaseInput[];
}

/** Precio base/compat del tipo = fase 'sale'. Fechas = min inicio / max fin. */
function basePriceFromPhases(phases: PhaseInput[] | undefined, fallbackCents: number): {
  priceCents: number; salesStart: string | null; salesEnd: string | null;
} {
  const list = phases ?? [];
  const sale = list.find((p) => p.kind === "sale");
  const starts = list.map((p) => p.startsAt).filter(Boolean) as string[];
  const ends = list.map((p) => p.endsAt).filter(Boolean) as string[];
  // Si alguna fase no tiene fin (null), el "fin de venta" compat queda null (abierto).
  const anyOpenEnd = list.some((p) => p.endsAt === null);
  return {
    priceCents: sale ? sale.priceCents : fallbackCents,
    salesStart: starts.length ? starts.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b)) : null,
    salesEnd: anyOpenEnd || !ends.length ? null : ends.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)),
  };
}

/** Reescribe TODAS las fases de un tipo (uso en creación: nada vendido aún). */
async function writeNewPhases(db: Awaited<ReturnType<typeof createClient>>, ticketTypeId: string, phases: PhaseInput[]) {
  if (!phases.length) return;
  await db.from("ticket_price_phases").insert(
    phases.map((p) => ({ ticket_type_id: ticketTypeId, kind: p.kind, price_cents: p.priceCents, starts_at: p.startsAt, ends_at: p.endsAt }))
  );
}

/**
 * Aplica edición de fases respetando la regla: una fase YA INICIADA solo puede
 * extender su fecha de fin (no cambiar precio ni inicio). Fases futuras: libres.
 * Desactivar la preventa solo se permite si aún no inició.
 */
async function applyPhaseEdits(
  db: Awaited<ReturnType<typeof createClient>>,
  ticketTypeId: string,
  desired: PhaseInput[],
): Promise<{ error?: string }> {
  const now = Date.now();
  // "Iniciada" = tiene un inicio EXPLÍCITO ya pasado. Una fase sin inicio (venta
  // abierta migrada) NO se considera iniciada: debe poder reconfigurarse (fijarle
  // inicio/precio). Los precios ya cobrados quedan congelados en order_items.
  const started = (s: string | null) => (s !== null && Date.parse(s) <= now);
  const { data: existing } = await db
    .from("ticket_price_phases")
    .select("id, kind, price_cents, starts_at, ends_at")
    .eq("ticket_type_id", ticketTypeId);
  const byKind = new Map((existing ?? []).map((p) => [p.kind as "presale" | "sale", p]));

  for (const kind of ["presale", "sale"] as const) {
    const want = desired.find((p) => p.kind === kind);
    const have = byKind.get(kind);
    if (want && have) {
      if (started(have.starts_at)) {
        // Solo extender el fin (nunca acortar por debajo del fin actual); precio/inicio intactos.
        const oldEnd = have.ends_at as string | null;
        const newEnd = want.endsAt;
        const finalEnd = oldEnd && newEnd ? (Date.parse(newEnd) > Date.parse(oldEnd) ? newEnd : oldEnd) : (newEnd ?? oldEnd);
        await db.from("ticket_price_phases").update({ ends_at: finalEnd }).eq("id", have.id);
      } else {
        await db.from("ticket_price_phases").update({ price_cents: want.priceCents, starts_at: want.startsAt, ends_at: want.endsAt }).eq("id", have.id);
      }
    } else if (want && !have) {
      await db.from("ticket_price_phases").insert({ ticket_type_id: ticketTypeId, kind, price_cents: want.priceCents, starts_at: want.startsAt, ends_at: want.endsAt });
    } else if (!want && have) {
      if (kind === "presale" && started(have.starts_at)) {
        return { error: "La preventa ya inició; no se puede desactivar (puedes ajustar su fin)." };
      }
      await db.from("ticket_price_phases").delete().eq("id", have.id);
    }
  }
  return {};
}

export async function createEvent(form: {
  title: string;
  description: string;
  category: string;
  city: string;
  region: string;
  venueName: string;
  days: EventDayInput[];
  timezone: string;
  currency: string;
  orgName: string;
  publish: boolean;
  tickets: TicketTypeInput[];
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Días del evento (al menos uno; fin > inicio; sin fechas repetidas).
  const dayErrors = validateDays(form.days);
  if (dayErrors.length) return { error: dayErrors[0] };
  const bounds = eventBounds(form.days)!;

  // 1) Org del usuario (o crear una la primera vez).
  let orgId: string | null = null;
  const { data: membership } = await db
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membership) {
    orgId = membership.org_id;
  } else {
    const orgName = form.orgName?.trim() || "Mi organización";
    const { data: newOrg, error: orgErr } = await db.rpc("create_organization", {
      p_name: orgName,
      p_slug: `${slugify(orgName)}-${crypto.randomUUID().slice(0, 6)}`,
    });
    if (orgErr) return { error: `No se pudo crear la organización: ${orgErr.message}` };
    orgId = newOrg as string;
  }

  // 2) Venue (opcional)
  let venueId: string | null = null;
  if (form.venueName?.trim()) {
    const { data: venue } = await db
      .from("venues")
      .insert({ org_id: orgId, name: form.venueName.trim(), city: form.city || null })
      .select("id")
      .single();
    venueId = venue?.id ?? null;
  }

  // 3) Evento
  const slug = `${slugify(form.title)}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: event, error: evErr } = await db
    .from("events")
    .insert({
      org_id: orgId,
      venue_id: venueId,
      slug,
      title: form.title,
      description: form.description || null,
      category: form.category || null,
      city: form.city || null,
      region: form.region || null,
      status: form.publish ? "published" : "draft",
      starts_at: bounds.startsAt,
      ends_at: bounds.endsAt,
      timezone: form.timezone || "America/Tijuana",
      currency: form.currency.toLowerCase(),
      published_at: form.publish ? new Date().toISOString() : null,
    })
    .select("id, slug")
    .single();
  if (evErr || !event) return { error: `No se pudo crear el evento: ${evErr?.message}` };

  // 3b) Días del evento (el trigger mantiene events.starts_at/ends_at sincronizados).
  const { error: daysErr } = await db.from("event_days").insert(
    form.days.map((d, i) => ({ event_id: event.id, day_date: d.dayDate, starts_at: d.startsAt, ends_at: d.endsAt, sort: i }))
  );
  if (daysErr) return { error: `Evento creado pero falló el horario: ${daysErr.message}` };

  // 4) Tipos de boleto + sus fases de precio (preventa/venta).
  const valid = form.tickets.filter((t) => t.name.trim() && t.quantity > 0);
  for (const t of valid) {
    const base = basePriceFromPhases(t.phases, Math.round(t.price * 100));
    const { data: tt, error: ttErr } = await db
      .from("ticket_types")
      .insert({
        event_id: event.id,
        name: t.name.trim(),
        price_cents: base.priceCents,
        currency: form.currency.toLowerCase(),
        quantity_total: Math.round(t.quantity),
        sales_start: base.salesStart,
        sales_end: base.salesEnd,
      })
      .select("id")
      .single();
    if (ttErr || !tt) return { error: `Evento creado pero falló crear boletos: ${ttErr?.message}` };
    // Si no vienen fases (compat), crea una fase 'sale' con el precio base.
    const phases: PhaseInput[] = linkSalePhase(t.phases?.length ? t.phases : [{ kind: "sale", priceCents: base.priceCents, startsAt: null, endsAt: null }]);
    await writeNewPhases(db, tt.id, phases);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?created=${event.slug}`);
}

export async function createPromo(form: {
  eventId: string;
  code: string;
  discountType: "percent" | "fixed";
  value: number; // % si percent; unidades de moneda si fixed
  maxRedemptions: number | null;
  expiresAt: string | null;
}) {
  const db = await createClient();
  const discount_value = form.discountType === "fixed" ? Math.round(form.value * 100) : Math.round(form.value);
  if (discount_value <= 0) return { error: "El descuento debe ser mayor a 0" };
  if (form.discountType === "percent" && discount_value > 100) return { error: "El porcentaje no puede pasar de 100" };

  const { error } = await db.from("promo_codes").insert({
    event_id: form.eventId,
    code: form.code.trim().toUpperCase(),
    discount_type: form.discountType,
    discount_value,
    max_redemptions: form.maxRedemptions,
    expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
  });
  if (error) return { error: error.message.includes("duplicate") ? "Ese código ya existe en el evento" : error.message };

  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function generateSeats(form: {
  ticketTypeId: string;
  eventId: string;
  section: string;
  rows: number;
  cols: number;
}) {
  const db = await createClient();
  const { error } = await db.rpc("generate_seats", {
    p_ticket_type: form.ticketTypeId,
    p_section: form.section.trim() || "General",
    p_rows: Math.round(form.rows),
    p_cols: Math.round(form.cols),
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function deletePromo(promoId: string, eventId: string) {
  const db = await createClient();
  await db.from("promo_codes").delete().eq("id", promoId);
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true };
}

export async function attachVenueMap(eventId: string, mapId: string) {
  const db = await createClient();
  const { error } = await db.rpc("attach_map_to_event", { p_event: eventId, p_map: mapId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true };
}

export async function setZonePrice(eventId: string, zoneId: string, priceCents: number) {
  const db = await createClient();
  const { error } = await db.rpc("set_zone_price", { p_event: eventId, p_zone: zoneId, p_price: Math.round(priceCents) });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true };
}

export async function createService(form: {
  eventId: string; currency: string; name: string; kind: string; price: number; inventory: number | null; maxPerOrder: number;
}) {
  const db = await createClient();
  if (!form.name.trim()) return { error: "Nombre requerido" };
  const { error } = await db.from("services").insert({
    event_id: form.eventId,
    name: form.name.trim(),
    kind: form.kind,
    price_cents: Math.round(form.price * 100),
    currency: form.currency.toLowerCase(),
    inventory: form.inventory,
    max_per_order: form.maxPerOrder || 10,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export interface UpdateEventResult {
  ok?: boolean; error?: string;
  notify?: { recipients: number; sent: number; queued: boolean; fields: string[] };
}

// Formato de fecha/hora en la zona del evento (para las notificaciones a asistentes).
const fmtDateTz = (iso: string, tz: string) => { try { return new Date(iso).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz || "America/Mexico_City" }); } catch { return ""; } };
const fmtTimeTz = (iso: string, tz: string) => { try { return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: tz || "America/Mexico_City" }); } catch { return ""; } };
const locOf = (online: boolean, city: string | null, region: string | null) => online ? "Evento virtual (en línea)" : [city, region].filter(Boolean).join(", ") || "Por confirmar";

/** Encola (y envía, si el evento es chico) una notificación de cambio a los asistentes. */
async function dispatchEventChangeNotification(opts: {
  eventId: string; userId: string | null; changes: FieldChange[];
  eventTitle: string; orgName: string; newDate: string; newTime: string; newLocation: string;
}): Promise<UpdateEventResult["notify"] | undefined> {
  if (!opts.changes.length) return undefined;
  const admin = createAdminClient();
  const recipients = await countRecipients(admin, opts.eventId);
  const payload: ChangePayload = { eventTitle: opts.eventTitle, orgName: opts.orgName, newDate: opts.newDate, newTime: opts.newTime, newLocation: opts.newLocation, changes: opts.changes };
  const { data: log } = await admin.from("event_change_log").insert({
    event_id: opts.eventId, changed_by: opts.userId, changes: opts.changes, recipients_count: recipients, channels: ["email"], status: "queued",
  }).select("id").single();
  const { data: job } = await admin.from("notification_jobs").insert({
    event_id: opts.eventId, log_id: log?.id ?? null, type: "event_change", payload, channels: ["email"], status: "pending", recipients_count: recipients,
  }).select("id, event_id, log_id, payload, channels").single();
  const fields = opts.changes.map((c) => c.label);
  if (!recipients || !job) return { recipients, sent: 0, queued: false, fields };
  // Eventos chicos: enviar de inmediato. Grandes (>400): los drena el cron.
  if (recipients <= 400) {
    const { sent } = await processNotificationJob(admin, job as { id: string; event_id: string; log_id: string | null; payload: ChangePayload; channels: string[] });
    return { recipients, sent, queued: false, fields };
  }
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base && process.env.CRON_SECRET) {
    void fetch(`${base}/api/cron/process-notifications`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).catch(() => {});
  }
  return { recipients, sent: 0, queued: true, fields };
}

export async function updateEventDetails(form: {
  eventId: string; title: string; description: string; category: string;
  venueName: string; venueAddress?: string; orgName?: string; city: string; region: string;
  timezone: string; currency: string;
  isOnline?: boolean; notifyOnChange?: boolean;
}): Promise<UpdateEventResult> {
  const db = await createClient();
  if (!form.title.trim()) return { error: "El título es obligatorio" };
  const { data: { user } } = await db.auth.getUser();

  // Snapshot ANTES del cambio (para comparar campos que afectan la asistencia).
  const { data: prev } = await db
    .from("events")
    .select("starts_at, ends_at, timezone, city, region, is_online, notify_on_change, org_id, venue_id, organizations(name)")
    .eq("id", form.eventId)
    .maybeSingle<{ starts_at: string; ends_at: string; timezone: string; city: string | null; region: string | null; is_online: boolean; notify_on_change: boolean; org_id: string; venue_id: string | null; organizations: { name: string } | { name: string }[] | null }>();

  const newCity = form.city?.trim() || null;
  const newRegion = form.region?.trim() || null;
  const newTz = form.timezone;
  const newIsOnline = form.isOnline ?? prev?.is_online ?? false;
  const notifyEnabled = form.notifyOnChange ?? prev?.notify_on_change ?? true;

  // RLS event_org_write garantiza que solo un miembro de la org pueda editarlo.
  // Las fechas NO se editan aquí: viven en event_days (ver setEventDays).
  const { error } = await db.from("events").update({
    title: form.title.trim(),
    description: form.description?.trim() || null,
    category: form.category?.trim() || null,
    city: newCity,
    region: newRegion,
    timezone: newTz,
    currency: form.currency.toLowerCase(),
    is_online: newIsOnline,
    notify_on_change: notifyEnabled,
  }).eq("id", form.eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  if (!prev) return { ok: true };

  // Lugar / venue (nombre + dirección): actualiza el venue vinculado o crea uno.
  const venueName = form.venueName?.trim();
  const venueAddress = form.venueAddress?.trim() || null;
  if (venueName) {
    if (prev.venue_id) {
      await db.from("venues").update({ name: venueName, address: venueAddress, city: newCity }).eq("id", prev.venue_id);
    } else {
      const { data: v } = await db.from("venues").insert({ org_id: prev.org_id, name: venueName, address: venueAddress, city: newCity }).select("id").single();
      if (v?.id) await db.from("events").update({ venue_id: v.id }).eq("id", form.eventId);
    }
  }

  // Marca / organizador: renombra la organización (requiere owner/admin por RLS).
  const curOrgName = Array.isArray(prev.organizations) ? prev.organizations[0]?.name : prev.organizations?.name;
  const newOrgName = form.orgName?.trim();
  if (newOrgName && newOrgName !== curOrgName) {
    await db.from("organizations").update({ name: newOrgName }).eq("id", prev.org_id);
  }

  // --- Detección de cambios de UBICACIÓN/MODALIDAD que afectan la asistencia ---
  // (La fecha/horario se notifican en setEventDays, que conoce el antes/después de los días.)
  const modOf = (online: boolean) => online ? "Virtual (en línea)" : "Presencial";
  const newDate = fmtDateTz(prev.starts_at, newTz);
  const newTime = `${fmtTimeTz(prev.starts_at, newTz)}–${fmtTimeTz(prev.ends_at, newTz)}`;
  const oldLoc = locOf(prev.is_online, prev.city, prev.region), newLoc = locOf(newIsOnline, newCity, newRegion);

  const changes: FieldChange[] = [];
  if (oldLoc !== newLoc) changes.push({ field: "venue", label: "Ubicación", old: oldLoc, new: newLoc });
  if (prev.is_online !== newIsOnline) changes.push({ field: "event_type", label: "Modalidad", old: modOf(prev.is_online), new: modOf(newIsOnline) });

  if (!changes.length || !notifyEnabled) return { ok: true };

  const orgName = Array.isArray(prev.organizations) ? prev.organizations[0]?.name : prev.organizations?.name;
  const notify = await dispatchEventChangeNotification({
    eventId: form.eventId, userId: user?.id ?? null, changes,
    eventTitle: form.title.trim(), orgName: orgName ?? "ShaarPass", newDate, newTime, newLocation: newLoc,
  });
  return { ok: true, notify };
}

export async function updateTicketType(form: {
  id: string; eventId: string; name: string; quantity: number;
  price?: number; // compat: precio de venta si no vienen fases
  phases?: PhaseInput[];
  eventEndsAt?: string | null;
}) {
  const db = await createClient();
  if (!form.name.trim()) return { error: "Nombre requerido" };
  // No permitir cantidad menor a lo ya vendido (inventario compartido entre fases).
  const { data: tt } = await db.from("ticket_types").select("quantity_sold, price_cents").eq("id", form.id).maybeSingle();
  const q = Math.round(form.quantity);
  if (tt && q < tt.quantity_sold) return { error: `Ya vendiste ${tt.quantity_sold}; la cantidad no puede ser menor` };

  const phases = linkSalePhase(form.phases ?? (form.price != null ? [{ kind: "sale" as const, priceCents: Math.round(form.price * 100), startsAt: null, endsAt: null }] : []));
  if (phases.length) {
    const { errors } = validatePhases(phases, { eventEndsAt: form.eventEndsAt ?? null });
    if (errors.length) return { error: errors[0] };
    const res = await applyPhaseEdits(db, form.id, phases);
    if (res.error) return { error: res.error };
  }
  const base = basePriceFromPhases(phases, tt?.price_cents ?? 0);
  const { error } = await db.from("ticket_types").update({
    name: form.name.trim(),
    quantity_total: q,
    price_cents: base.priceCents,
    sales_start: base.salesStart,
    sales_end: base.salesEnd,
  }).eq("id", form.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function addTicketType(form: {
  eventId: string; currency: string; name: string; quantity: number;
  price?: number; phases?: PhaseInput[]; eventEndsAt?: string | null;
}) {
  const db = await createClient();
  if (!form.name.trim()) return { error: "Nombre requerido" };
  const phases: PhaseInput[] = linkSalePhase(form.phases?.length
    ? form.phases
    : [{ kind: "sale", priceCents: Math.round((form.price ?? 0) * 100), startsAt: null, endsAt: null }]);
  const { errors } = validatePhases(phases, { eventEndsAt: form.eventEndsAt ?? null });
  if (errors.length) return { error: errors[0] };
  const base = basePriceFromPhases(phases, Math.round((form.price ?? 0) * 100));
  const { data: tt, error } = await db.from("ticket_types").insert({
    event_id: form.eventId,
    name: form.name.trim(),
    price_cents: base.priceCents,
    currency: form.currency.toLowerCase(),
    quantity_total: Math.max(0, Math.round(form.quantity)),
    sales_start: base.salesStart,
    sales_end: base.salesEnd,
  }).select("id").single();
  if (error || !tt) return { error: error?.message ?? "No se pudo crear el boleto" };
  await writeNewPhases(db, tt.id, phases);
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

/** Actualiza el horario (días) de un evento de forma NO destructiva: actualiza los
 *  días por fecha, inserta los nuevos y borra los que sobran SOLO si no tienen
 *  ingresos registrados (para no perder el historial de acceso). El trigger
 *  mantiene events.starts_at/ends_at sincronizados. */
export async function setEventDays(form: { eventId: string; days: EventDayInput[] }): Promise<UpdateEventResult> {
  const db = await createClient();
  const errs = validateDays(form.days);
  if (errs.length) return { error: errs[0] };
  const { data: { user } } = await db.auth.getUser();

  // Snapshot ANTES (para notificar si cambia la fecha/horario del evento).
  const { data: prev } = await db
    .from("events")
    .select("starts_at, ends_at, timezone, title, city, region, is_online, notify_on_change, organizations(name)")
    .eq("id", form.eventId)
    .maybeSingle<{ starts_at: string; ends_at: string; timezone: string; title: string; city: string | null; region: string | null; is_online: boolean; notify_on_change: boolean; organizations: { name: string } | { name: string }[] | null }>();

  const { data: existing } = await db
    .from("event_days")
    .select("id, day_date")
    .eq("event_id", form.eventId);
  const byDate = new Map((existing ?? []).map((d) => [d.day_date as string, d.id as string]));
  const wanted = new Set(form.days.map((d) => d.dayDate));

  // upsert por fecha
  for (let i = 0; i < form.days.length; i++) {
    const d = form.days[i];
    const id = byDate.get(d.dayDate);
    if (id) {
      const { error } = await db.from("event_days").update({ starts_at: d.startsAt, ends_at: d.endsAt, sort: i }).eq("id", id);
      if (error) return { error: error.message };
    } else {
      const { error } = await db.from("event_days").insert({ event_id: form.eventId, day_date: d.dayDate, starts_at: d.startsAt, ends_at: d.endsAt, sort: i });
      if (error) return { error: error.message };
    }
  }
  // borrar días que ya no están (solo si no tienen check-ins)
  for (const [date, id] of byDate) {
    if (wanted.has(date)) continue;
    const { count } = await db.from("ticket_checkins").select("id", { count: "exact", head: true }).eq("event_day_id", id);
    if (count && count > 0) return { error: `No se puede quitar el día ${date}: ya tiene ingresos registrados.` };
    const { error } = await db.from("event_days").delete().eq("id", id);
    if (error) return { error: error.message };
  }
  revalidatePath(`/dashboard/eventos/${form.eventId}`);

  // --- Notificar a asistentes si cambió la FECHA u HORARIO del evento ---
  if (!prev) return { ok: true };
  const tz = prev.timezone;
  const nb = eventBounds(form.days)!; // nuevos límites (primer inicio / último fin)
  const oldDate = fmtDateTz(prev.starts_at, tz), newDate = fmtDateTz(nb.startsAt, tz);
  const oldTime = `${fmtTimeTz(prev.starts_at, tz)}–${fmtTimeTz(prev.ends_at, tz)}`;
  const newTime = `${fmtTimeTz(nb.startsAt, tz)}–${fmtTimeTz(nb.endsAt, tz)}`;

  const changes: FieldChange[] = [];
  if (oldDate !== newDate) changes.push({ field: "event_date", label: "Fecha", old: oldDate, new: newDate });
  if (oldTime !== newTime) changes.push({ field: "start_time", label: "Horario", old: oldTime, new: newTime });
  if (!changes.length || !prev.notify_on_change) return { ok: true };

  const orgName = Array.isArray(prev.organizations) ? prev.organizations[0]?.name : prev.organizations?.name;
  const notify = await dispatchEventChangeNotification({
    eventId: form.eventId, userId: user?.id ?? null, changes,
    eventTitle: prev.title, orgName: orgName ?? "ShaarPass",
    newDate, newTime, newLocation: locOf(prev.is_online, prev.city, prev.region),
  });
  return { ok: true, notify };
}

/**
 * Publica o despublica un evento. Al publicar valida: ≥1 día de horario, ≥1 tipo de
 * boleto con precio y fases válidas, y cuenta de cobro conectada (salvo evento gratis).
 */
export async function setEventStatus(form: { eventId: string; publish: boolean }): Promise<{ ok?: true; error?: string }> {
  const db = await createClient();

  if (!form.publish) {
    const { error } = await db.from("events").update({ status: "draft" }).eq("id", form.eventId);
    if (error) return { error: error.message };
    revalidatePath(`/dashboard/eventos/${form.eventId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  }

  // 1) Al menos un día de horario.
  const { count: dayCount } = await db.from("event_days").select("id", { count: "exact", head: true }).eq("event_id", form.eventId);
  if (!dayCount) return { error: "Agrega al menos un día de horario antes de publicar." };

  // 2) Al menos un tipo de boleto con precio y fases válidas.
  const { data: types } = await db.from("ticket_types").select("id, price_cents").eq("event_id", form.eventId);
  if (!types?.length) return { error: "Agrega al menos un tipo de boleto antes de publicar." };
  const typeIds = types.map((t) => t.id);
  const { data: phaseRows } = await db.from("ticket_price_phases").select("ticket_type_id, kind, price_cents, starts_at, ends_at").in("ticket_type_id", typeIds);
  const byType = new Map<string, PhaseInput[]>();
  for (const r of phaseRows ?? []) {
    const a = byType.get(r.ticket_type_id) ?? [];
    a.push({ kind: r.kind as "presale" | "sale", priceCents: r.price_cents, startsAt: r.starts_at, endsAt: r.ends_at });
    byType.set(r.ticket_type_id, a);
  }
  let anyValid = false;
  let maxPrice = 0;
  for (const t of types) {
    const ph = byType.get(t.id) ?? [{ kind: "sale" as const, priceCents: t.price_cents, startsAt: null, endsAt: null }];
    const { errors } = validatePhases(ph);
    maxPrice = Math.max(maxPrice, ...ph.map((p) => p.priceCents), 0);
    if (!errors.length) anyValid = true;
  }
  if (!anyValid) return { error: "Revisa precios y fechas de tus boletos: hay fases inválidas." };

  // 3) Cuenta de cobro conectada (salvo evento 100% gratis).
  if (maxPrice > 0) {
    const { data: ev } = await db
      .from("events")
      .select("organizations(payment_gateway, mp_connected, charges_enabled)")
      .eq("id", form.eventId)
      .maybeSingle<{ organizations: { payment_gateway: string; mp_connected: boolean; charges_enabled: boolean } | { payment_gateway: string; mp_connected: boolean; charges_enabled: boolean }[] | null }>();
    const org = Array.isArray(ev?.organizations) ? ev?.organizations[0] : ev?.organizations;
    const connected = org?.payment_gateway === "mercadopago" ? org?.mp_connected : org?.charges_enabled;
    if (!connected) return { error: "Conecta tu cuenta de cobro en “Pagos” antes de publicar." };
  }

  const { error } = await db.from("events").update({ status: "published", published_at: new Date().toISOString() }).eq("id", form.eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setEventCover(eventId: string, coverUrl: string | null) {
  const db = await createClient();
  // RLS (event_org_write) garantiza que solo un miembro de la org pueda cambiarla.
  const { error } = await db.from("events").update({ cover_image: coverUrl }).eq("id", eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true };
}

export async function deleteService(serviceId: string, eventId: string) {
  const db = await createClient();
  await db.from("services").delete().eq("id", serviceId);
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true };
}

export async function sendCampaign(eventId: string, subject: string, body: string) {
  const { sendBulkEmail } = await import("@/lib/email/campaigns");
  const db = await createClient();
  if (!subject.trim() || !body.trim()) return { error: "Asunto y mensaje requeridos" };

  // Compradores únicos de órdenes pagadas (RLS: solo miembros de la org ven las órdenes).
  const { data: orders } = await db
    .from("orders").select("buyer_email").eq("event_id", eventId).eq("status", "paid");
  const emails = Array.from(new Set((orders ?? []).map((o) => o.buyer_email).filter(Boolean)));
  if (emails.length === 0) return { error: "Aún no hay compradores a quién enviar" };

  const res = await sendBulkEmail(emails, subject.trim(), body.trim());
  await db.from("email_campaigns").insert({ event_id: eventId, subject: subject.trim(), body: body.trim(), recipients: res.sent });
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true, sent: res.sent, total: emails.length, reason: res.reason };
}

export async function setQueueConfig(form: { eventId: string; enabled: boolean; onsaleAt: string | null; waveSize: number; maxPerBuyer: number | null; safetix: boolean }) {
  const db = await createClient();
  const { error } = await db.from("events").update({
    queue_enabled: form.enabled,
    onsale_at: form.onsaleAt ? new Date(form.onsaleAt).toISOString() : null,
    queue_wave_size: Math.max(1, Math.round(form.waveSize)),
    queue_drawn: false, // re-sortea en el próximo onsale
    max_tickets_per_buyer: form.maxPerBuyer && form.maxPerBuyer > 0 ? Math.round(form.maxPerBuyer) : null,
    safetix_enabled: form.safetix,
  }).eq("id", form.eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function setPresaleConfig(form: { eventId: string; enabled: boolean; endsAt: string | null }) {
  const db = await createClient();
  const { error } = await db.from("events").update({
    presale_enabled: form.enabled,
    presale_ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
  }).eq("id", form.eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function runPresaleLottery(eventId: string, count: number) {
  const { sendBulkEmail } = await import("@/lib/email/campaigns");
  const db = await createClient();
  const { data: n, error } = await db.rpc("run_presale_lottery", { p_event: eventId, p_count: Math.max(0, Math.round(count)) });
  if (error) return { error: error.message };
  // Envía códigos a los seleccionados sin avisar (no-op sin Resend).
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
  const { data: winners } = await db.from("presale_registrations")
    .select("email, code").eq("event_id", eventId).eq("selected", true).is("used_at", null);
  for (const w of winners ?? []) {
    if (w.code) await sendBulkEmail([w.email], "¡Fuiste seleccionado para el presale!",
      `Tu código de acceso anticipado: ${w.code}\nCómpralo aquí: ${base}`);
  }
  revalidatePath(`/dashboard/eventos/${eventId}`);
  return { ok: true, selected: n as number };
}

// ─── Abonos / temporada (TM-7) ───────────────────────────────────────────────

async function currentOrgId(db: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: m } = await db.from("org_members").select("org_id").eq("user_id", user.id).limit(1).maybeSingle();
  return m?.org_id ?? null;
}

export async function createSeason(form: { title: string; description: string; currency: string; price: number; quantity: number }) {
  const db = await createClient();
  const orgId = await currentOrgId(db);
  if (!orgId) return { error: "Crea primero un evento (necesitas una organización)" };
  if (!form.title.trim()) return { error: "Título requerido" };

  const slug = `${slugify(form.title)}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await db.from("seasons").insert({
    org_id: orgId,
    slug,
    title: form.title.trim(),
    description: form.description?.trim() || null,
    currency: form.currency.toLowerCase(),
    price_cents: Math.round(form.price * 100),
    quantity_total: Math.max(0, Math.round(form.quantity)),
  }).select("id").single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear el abono" };
  revalidatePath("/dashboard/abonos");
  redirect(`/dashboard/abonos/${data.id}`);
}

export async function addSeasonEvent(form: { seasonId: string; eventId: string; ticketTypeId: string }) {
  const db = await createClient();
  const { error } = await db.from("season_events").insert({
    season_id: form.seasonId,
    event_id: form.eventId,
    ticket_type_id: form.ticketTypeId,
  });
  if (error) return { error: error.message.includes("duplicate") ? "Ese evento ya está en el abono" : error.message };
  revalidatePath(`/dashboard/abonos/${form.seasonId}`);
  return { ok: true };
}

export async function removeSeasonEvent(seasonId: string, eventId: string) {
  const db = await createClient();
  await db.from("season_events").delete().eq("season_id", seasonId).eq("event_id", eventId);
  revalidatePath(`/dashboard/abonos/${seasonId}`);
  return { ok: true };
}

export async function publishSeason(seasonId: string, publish: boolean) {
  const db = await createClient();
  // No publicar un abono vacío.
  if (publish) {
    const { count } = await db.from("season_events").select("event_id", { count: "exact", head: true }).eq("season_id", seasonId);
    if (!count) return { error: "Agrega al menos un evento antes de publicar" };
  }
  const { error } = await db.from("seasons").update({ status: publish ? "published" : "draft" }).eq("id", seasonId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/abonos/${seasonId}`);
  return { ok: true };
}

// ─── Marca / White-label (TM) ────────────────────────────────────────────────

export async function saveBranding(form: { logoUrl: string | null; brandColor: string | null; whiteLabel: boolean }) {
  const db = await createClient();
  const orgId = await currentOrgId(db);
  if (!orgId) return { error: "Sin organización" };
  const color = form.brandColor?.trim() || null;
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: "Color inválido (usa formato #RRGGBB)" };
  const { error } = await db.from("organizations").update({
    logo_url: form.logoUrl?.trim() || null,
    brand_color: color,
    white_label: form.whiteLabel,
  }).eq("id", orgId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/marca");
  return { ok: true };
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}

// --- Equipo de Recepción (staff de check-in) ---

function staffToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

export async function addCheckinStaff(form: { eventId: string; name: string; gate?: string; expiresAt?: string | null }) {
  const db = await createClient();
  if (!form.name.trim()) return { error: "El nombre es obligatorio" };
  const { data: { user } } = await db.auth.getUser();
  // RLS event_staff_org: solo un miembro de la org puede insertar.
  const { data, error } = await db.from("event_staff").insert({
    event_id: form.eventId,
    name: form.name.trim(),
    gate: form.gate?.trim() || null,
    token: staffToken(),
    expires_at: form.expiresAt || null,
    created_by: user?.id ?? null,
  }).select("id, token").single();
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true, id: data.id, token: data.token };
}

export async function revokeCheckinStaff(form: { staffId: string; eventId: string; revoked: boolean }) {
  const db = await createClient();
  const { error } = await db.from("event_staff").update({ revoked: form.revoked }).eq("id", form.staffId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

// --- Campañas de email (constructor + segmentación + programación) ---

export interface CampaignForm {
  id?: string; eventId: string; name: string; subject: string; preheader?: string;
  fromName?: string; replyTo?: string; bodyHtml: string; segment: Segment;
}

async function upsertCampaign(form: CampaignForm): Promise<{ id?: string; error?: string }> {
  const db = await createClient();
  if (!form.name.trim() || !form.subject.trim()) return { error: "Nombre y asunto son obligatorios" };
  const { data: { user } } = await db.auth.getUser();
  const row = {
    event_id: form.eventId, name: form.name.trim(), subject: form.subject.trim(),
    preheader: form.preheader?.trim() || null, from_name: form.fromName?.trim() || null,
    reply_to: form.replyTo?.trim() || null, body_html: form.bodyHtml, segment: form.segment,
  };
  if (form.id) {
    const { error } = await db.from("campaigns").update(row).eq("id", form.id);
    if (error) return { error: error.message };
    return { id: form.id };
  }
  const { data, error } = await db.from("campaigns").insert({ ...row, created_by: user?.id ?? null }).select("id").single();
  if (error) return { error: error.message };
  return { id: data.id };
}

/** Guarda + envía YA. */
export async function sendCampaign2(form: CampaignForm) {
  const saved = await upsertCampaign(form);
  if (saved.error || !saved.id) return { error: saved.error ?? "No se pudo guardar" };
  const { sendCampaignNow } = await import("@/lib/email/campaignSend");
  const admin = createAdminClient();
  const res = await sendCampaignNow(admin, saved.id);
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true, ...res };
}

/** Guarda + programa para una fecha/hora (ISO en UTC). */
export async function scheduleCampaign(form: CampaignForm & { scheduledAt: string; timezone: string }) {
  const saved = await upsertCampaign(form);
  if (saved.error || !saved.id) return { error: saved.error ?? "No se pudo guardar" };
  const db = await createClient();
  const { error } = await db.from("campaigns").update({ status: "scheduled", scheduled_at: form.scheduledAt, timezone: form.timezone }).eq("id", saved.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true, id: saved.id };
}

export async function sendTestCampaign(form: { eventId: string; to: string; subject: string; preheader?: string; bodyHtml: string; fromName?: string; replyTo?: string }) {
  const db = await createClient();
  const { data: ev } = await db.from("events").select("title, starts_at, timezone").eq("id", form.eventId).maybeSingle();
  const { sendTest } = await import("@/lib/email/campaignSend");
  const eventDate = ev?.starts_at ? new Date(ev.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: ev?.timezone ?? "America/Mexico_City" }) : "";
  const res = await sendTest({ to: form.to, subject: form.subject, preheader: form.preheader, bodyHtml: form.bodyHtml, fromName: form.fromName, replyTo: form.replyTo, eventName: ev?.title ?? "", eventDate });
  if (!res.sent) return { error: res.reason === "no_key" ? "Falta configurar Resend." : (res.reason ?? "No se pudo enviar la prueba") };
  return { ok: true };
}

export async function getCampaignCountryMetrics(campaignId: string) {
  const db = await createClient();
  // RLS campaign_emails_read garantiza que solo la org del evento ve estos datos.
  const { data, error } = await db.from("campaign_emails")
    .select("country, delivered, opened, clicked").eq("campaign_id", campaignId);
  if (error) return { error: error.message };
  const map = new Map<string, { total: number; delivered: number; opened: number; clicked: number }>();
  for (const r of data ?? []) {
    const c = r.country || "—";
    const m = map.get(c) ?? { total: 0, delivered: 0, opened: 0, clicked: 0 };
    m.total++; if (r.delivered) m.delivered++; if (r.opened) m.opened++; if (r.clicked) m.clicked++;
    map.set(c, m);
  }
  return { rows: [...map.entries()].map(([country, m]) => ({ country, ...m })).sort((a, b) => b.total - a.total) };
}

export async function toggleAutomation(form: { eventId: string; key: string; enabled: boolean }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!form.enabled) {
    const { error } = await db.from("campaigns").delete().eq("event_id", form.eventId).eq("automation_key", form.key);
    if (error) return { error: error.message };
    revalidatePath(`/dashboard/eventos/${form.eventId}`);
    return { ok: true };
  }
  const { automationDef, automationScheduledAt } = await import("@/lib/email/automations");
  const def = automationDef(form.key);
  if (!def) return { error: "Automatización desconocida" };
  const { data: ev } = await db.from("events").select("starts_at, ends_at").eq("id", form.eventId).maybeSingle();
  if (!ev) return { error: "Evento no encontrado" };

  // Bienvenida: disparada al registrarse (sin fecha; status 'active').
  const isRegister = !!def.onRegister;
  let scheduledAt: string | null = null;
  if (!isRegister) {
    scheduledAt = automationScheduledAt(def, ev.starts_at, ev.ends_at);
    if (new Date(scheduledAt).getTime() <= Date.now()) return { error: "Esa fecha ya pasó para este evento" };
  }
  // Upsert por (event_id, automation_key) — índice único evita duplicados.
  const { error } = await db.from("campaigns").upsert({
    event_id: form.eventId, kind: "automation", automation_key: form.key,
    name: def.label, subject: def.subject, body_html: def.body, segment: { type: "all" },
    status: isRegister ? "active" : "scheduled", scheduled_at: scheduledAt, created_by: user?.id ?? null,
  }, { onConflict: "event_id,automation_key" });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true, scheduledAt };
}

export async function deleteCampaign(form: { id: string; eventId: string }) {
  const db = await createClient();
  const { error } = await db.from("campaigns").delete().eq("id", form.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function deleteOrder(form: { orderId: string; eventId: string }) {
  const db = await createClient();
  // RPC delete_order: valida que el usuario sea miembro de la org y libera inventario/asientos.
  const { error } = await db.rpc("delete_order", { p_order_id: form.orderId });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function removeCheckinStaff(form: { staffId: string; eventId: string }) {
  const db = await createClient();
  const { error } = await db.from("event_staff").delete().eq("id", form.staffId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}
