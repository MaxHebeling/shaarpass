"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRecipients, processNotificationJob, type FieldChange, type ChangePayload } from "@/lib/notifications/eventChange";

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
  price: number; // en unidades de moneda (no centavos)
  quantity: number;
}

export async function createEvent(form: {
  title: string;
  description: string;
  category: string;
  city: string;
  region: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  currency: string;
  orgName: string;
  publish: boolean;
  tickets: TicketTypeInput[];
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "No autenticado" };

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
      starts_at: form.startsAt,
      ends_at: form.endsAt,
      timezone: form.timezone || "America/Tijuana",
      currency: form.currency.toLowerCase(),
      published_at: form.publish ? new Date().toISOString() : null,
    })
    .select("id, slug")
    .single();
  if (evErr || !event) return { error: `No se pudo crear el evento: ${evErr?.message}` };

  // 4) Tipos de boleto
  const rows = form.tickets
    .filter((t) => t.name.trim() && t.quantity > 0)
    .map((t) => ({
      event_id: event.id,
      name: t.name.trim(),
      price_cents: Math.round(t.price * 100),
      currency: form.currency.toLowerCase(),
      quantity_total: Math.round(t.quantity),
    }));
  if (rows.length) {
    const { error: ttErr } = await db.from("ticket_types").insert(rows);
    if (ttErr) return { error: `Evento creado pero falló crear boletos: ${ttErr.message}` };
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

export async function updateEventDetails(form: {
  eventId: string; title: string; description: string; category: string;
  venueName: string; city: string; region: string;
  startsAt: string; endsAt: string; timezone: string; currency: string;
  isOnline?: boolean; notifyOnChange?: boolean;
}): Promise<UpdateEventResult> {
  const db = await createClient();
  if (!form.title.trim()) return { error: "El título es obligatorio" };
  const { data: { user } } = await db.auth.getUser();

  // Snapshot ANTES del cambio (para comparar campos que afectan la asistencia).
  const { data: prev } = await db
    .from("events")
    .select("starts_at, ends_at, timezone, city, region, is_online, notify_on_change, org_id, organizations(name)")
    .eq("id", form.eventId)
    .maybeSingle<{ starts_at: string; ends_at: string; timezone: string; city: string | null; region: string | null; is_online: boolean; notify_on_change: boolean; org_id: string; organizations: { name: string } | { name: string }[] | null }>();

  const newCity = form.city?.trim() || null;
  const newRegion = form.region?.trim() || null;
  const newTz = form.timezone;
  const newIsOnline = form.isOnline ?? prev?.is_online ?? false;
  const notifyEnabled = form.notifyOnChange ?? prev?.notify_on_change ?? true;

  // RLS event_org_write garantiza que solo un miembro de la org pueda editarlo.
  const { error } = await db.from("events").update({
    title: form.title.trim(),
    description: form.description?.trim() || null,
    category: form.category?.trim() || null,
    city: newCity,
    region: newRegion,
    starts_at: form.startsAt,
    ends_at: form.endsAt,
    timezone: newTz,
    currency: form.currency.toLowerCase(),
    is_online: newIsOnline,
    notify_on_change: notifyEnabled,
  }).eq("id", form.eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  if (!prev) return { ok: true };

  // --- Detección de cambios que afectan la asistencia ---
  const fmtDate = (iso: string, tz: string) => { try { return new Date(iso).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz || "America/Mexico_City" }); } catch { return ""; } };
  const fmtTime = (iso: string, tz: string) => { try { return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: tz || "America/Mexico_City" }); } catch { return ""; } };
  const locOf = (online: boolean, city: string | null, region: string | null) => online ? "Evento virtual (en línea)" : [city, region].filter(Boolean).join(", ") || "Por confirmar";
  const modOf = (online: boolean) => online ? "Virtual (en línea)" : "Presencial";

  const oldDate = fmtDate(prev.starts_at, prev.timezone), newDate = fmtDate(form.startsAt, newTz);
  const oldTime = `${fmtTime(prev.starts_at, prev.timezone)}–${fmtTime(prev.ends_at, prev.timezone)}`;
  const newTime = `${fmtTime(form.startsAt, newTz)}–${fmtTime(form.endsAt, newTz)}`;
  const oldLoc = locOf(prev.is_online, prev.city, prev.region), newLoc = locOf(newIsOnline, newCity, newRegion);

  const changes: FieldChange[] = [];
  if (oldDate !== newDate) changes.push({ field: "event_date", label: "Fecha", old: oldDate, new: newDate });
  if (oldTime !== newTime || prev.timezone !== newTz) changes.push({ field: "start_time", label: "Horario", old: oldTime, new: newTime });
  if (oldLoc !== newLoc) changes.push({ field: "venue", label: "Ubicación", old: oldLoc, new: newLoc });
  if (prev.is_online !== newIsOnline) changes.push({ field: "event_type", label: "Modalidad", old: modOf(prev.is_online), new: modOf(newIsOnline) });

  if (!changes.length || !notifyEnabled) return { ok: true };

  // --- Notificación a asistentes (cola + auditoría, vía service role) ---
  const admin = createAdminClient();
  const recipients = await countRecipients(admin, form.eventId);
  const orgName = Array.isArray(prev.organizations) ? prev.organizations[0]?.name : prev.organizations?.name;
  const payload: ChangePayload = { eventTitle: form.title.trim(), orgName: orgName ?? "ShaarPass", newDate, newTime, newLocation: newLoc, changes };

  const { data: log } = await admin.from("event_change_log").insert({
    event_id: form.eventId, changed_by: user?.id ?? null, changes, recipients_count: recipients, channels: ["email"], status: "queued",
  }).select("id").single();

  const { data: job } = await admin.from("notification_jobs").insert({
    event_id: form.eventId, log_id: log?.id ?? null, type: "event_change", payload, channels: ["email"], status: "pending", recipients_count: recipients,
  }).select("id, event_id, log_id, payload, channels").single();

  if (!recipients || !job) return { ok: true, notify: { recipients, sent: 0, queued: false, fields: changes.map((c) => c.label) } };

  // Eventos chicos: enviar de inmediato. Grandes (>400): los drena el cron.
  if (recipients <= 400) {
    const { sent } = await processNotificationJob(admin, job as { id: string; event_id: string; log_id: string | null; payload: ChangePayload; channels: string[] });
    return { ok: true, notify: { recipients, sent, queued: false, fields: changes.map((c) => c.label) } };
  }
  // Kick best-effort al worker; el cron es la red de seguridad.
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base && process.env.CRON_SECRET) {
    void fetch(`${base}/api/cron/process-notifications`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }).catch(() => {});
  }
  return { ok: true, notify: { recipients, sent: 0, queued: true, fields: changes.map((c) => c.label) } };
}

export async function updateTicketType(form: {
  id: string; eventId: string; name: string; price: number; quantity: number;
}) {
  const db = await createClient();
  if (!form.name.trim()) return { error: "Nombre requerido" };
  // No permitir cantidad menor a lo ya vendido.
  const { data: tt } = await db.from("ticket_types").select("quantity_sold").eq("id", form.id).maybeSingle();
  const q = Math.round(form.quantity);
  if (tt && q < tt.quantity_sold) return { error: `Ya vendiste ${tt.quantity_sold}; la cantidad no puede ser menor` };
  const { error } = await db.from("ticket_types").update({
    name: form.name.trim(),
    price_cents: Math.round(form.price * 100),
    quantity_total: q,
  }).eq("id", form.id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function addTicketType(form: {
  eventId: string; currency: string; name: string; price: number; quantity: number;
}) {
  const db = await createClient();
  if (!form.name.trim()) return { error: "Nombre requerido" };
  const { error } = await db.from("ticket_types").insert({
    event_id: form.eventId,
    name: form.name.trim(),
    price_cents: Math.round(form.price * 100),
    currency: form.currency.toLowerCase(),
    quantity_total: Math.max(0, Math.round(form.quantity)),
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
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
