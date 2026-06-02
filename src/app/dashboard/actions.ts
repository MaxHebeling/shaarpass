"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export async function setQueueConfig(form: { eventId: string; enabled: boolean; onsaleAt: string | null; waveSize: number }) {
  const db = await createClient();
  const { error } = await db.from("events").update({
    queue_enabled: form.enabled,
    onsale_at: form.onsaleAt ? new Date(form.onsaleAt).toISOString() : null,
    queue_wave_size: Math.max(1, Math.round(form.waveSize)),
    queue_drawn: false, // re-sortea en el próximo onsale
  }).eq("id", form.eventId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/eventos/${form.eventId}`);
  return { ok: true };
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/login");
}
