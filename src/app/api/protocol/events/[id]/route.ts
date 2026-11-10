import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveProtocolAccess, can, type Permission, type ProtocolAccess } from "@/lib/protocol/access";
import { attendeesLinkForOrder, loadProtocolData } from "@/lib/protocol/data";
import {
  CATEGORIES, CONFIRMATION, COVERAGE_CLAIMS, suggestSeating, tableOccupancy,
} from "@/lib/protocol/rules";

export const runtime = "nodejs";

/**
 * API administrativa del módulo de Protocolo de un evento.
 * Tenant y rol se resuelven SIEMPRE en servidor (resolveProtocolAccess); cada id
 * recibido se re-filtra por el event_id autorizado → sin acceso horizontal.
 */
const uuid = z.string().uuid();
const txt = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));

const personFields = {
  full_name: txt(160), email: z.string().trim().max(200).email().nullable().optional().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  phone: txt(40), city: txt(120), category: z.enum(CATEGORIES).nullable().optional(), relation: txt(120),
  is_pastor: z.boolean().nullable().optional(), coverage_claim: z.enum(COVERAGE_CLAIMS).nullable().optional(),
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("settings.update"),
    enabled: z.boolean().optional(), companions_enabled: z.boolean().optional(), coverage_enabled: z.boolean().optional(),
    coverage_leader: txt(120), meals_enabled: z.boolean().optional(), tables_enabled: z.boolean().optional(),
    guests_enabled: z.boolean().optional(), lock_after_checkin: z.boolean().optional(),
    edit_deadline: z.string().datetime({ offset: true }).nullable().optional(),
  }),
  z.object({
    action: z.literal("person.update"), id: uuid, ...personFields,
    confirmation_status: z.enum(CONFIRMATION).optional(), access_category: txt(60), badge: txt(60), admin_notes: txt(1000),
  }),
  z.object({ action: z.literal("person.coverage"), id: uuid, status: z.enum(["confirmed", "not_confirmed", "pending"]), note: txt(500) }),
  z.object({
    action: z.literal("guest.create"), ...personFields, full_name: z.string().trim().min(2).max(160),
    access_category: txt(60), badge: txt(60), admin_notes: txt(1000),
  }),
  z.object({ action: z.literal("guest.delete"), id: uuid }),
  z.object({
    action: z.literal("meal.session.create"), name: z.string().trim().min(1).max(120),
    starts_at: z.string().datetime({ offset: true }).nullable().optional(), capacity: z.number().int().positive().max(5000).nullable().optional(),
  }),
  z.object({ action: z.literal("meal.session.delete"), id: uuid }),
  z.object({
    action: z.literal("meal.invite"), session_id: uuid, person_ids: z.array(uuid).min(1).max(500),
    invitation_type: txt(60), companions_allowed: z.number().int().min(0).max(20).optional(),
  }),
  z.object({
    action: z.literal("meal.update"), id: uuid, status: z.enum(CONFIRMATION).optional(),
    invitation_type: txt(60), companions_allowed: z.number().int().min(0).max(20).optional(), badge: txt(60), notes: txt(500),
  }),
  z.object({ action: z.literal("meal.uninvite"), id: uuid }),
  z.object({
    action: z.literal("table.save"), id: uuid.optional(), name: z.string().trim().min(1).max(80),
    capacity: z.number().int().min(1).max(200), reserved_seats: z.number().int().min(0).max(200).optional(),
    reserved_for: txt(120), session_id: uuid.nullable().optional(), sort: z.number().int().min(0).max(10000).optional(),
  }),
  z.object({ action: z.literal("table.delete"), id: uuid }),
  z.object({ action: z.literal("table.assign"), table_id: uuid, person_id: uuid, allow_over: z.boolean().optional(), seat_label: txt(20) }),
  z.object({ action: z.literal("table.unassign"), person_id: uuid }),
  z.object({ action: z.literal("table.suggest") }),
  z.object({ action: z.literal("table.applySuggestions"), pairs: z.array(z.object({ person_id: uuid, table_id: uuid })).min(1).max(1000) }),
  z.object({ action: z.literal("link.get"), order_id: uuid }),
]);
type Action = z.infer<typeof actionSchema>;

const PERM: Record<Action["action"], Permission> = {
  "settings.update": "settings", "person.update": "editPeople", "person.coverage": "validateCoverage",
  "guest.create": "manageGuests", "guest.delete": "manageGuests",
  "meal.session.create": "manageMeals", "meal.session.delete": "manageMeals", "meal.invite": "manageMeals",
  "meal.update": "confirmMeals", "meal.uninvite": "manageMeals",
  "table.save": "manageTables", "table.delete": "manageTables", "table.assign": "manageTables",
  "table.unassign": "manageTables", "table.suggest": "manageTables", "table.applySuggestions": "manageTables",
  "link.get": "buyerLinks",
};

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Verifica que un id pertenece al evento autorizado (anti acceso horizontal). */
async function owned(a: ProtocolAccess, table: string, id: string) {
  const { data } = await a.db.from(table).select("*").eq("id", id).eq("event_id", a.event.id).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await resolveProtocolAccess(id, "view");
  if (!a.ok) return bad(a.error, a.status);
  if (!a.settings?.enabled) return NextResponse.json({ settings: a.settings, role: a.role, data: null });
  const data = await loadProtocolData(a.db, id);
  return NextResponse.json({ settings: a.settings, role: a.role, data }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const body = parsed.data;

  const a = await resolveProtocolAccess(id, PERM[body.action]);
  if (!a.ok) return bad(a.error, a.status);
  const { db, userId } = a;
  const eventId = a.event.id;
  const admin = { updated_by: userId, updated_by_kind: "admin" as const };

  // Salvo la configuración, todo exige el módulo activo en el evento.
  if (body.action !== "settings.update" && !a.settings?.enabled) return bad("Activa el módulo en este evento primero", 409);
  const s = a.settings;

  switch (body.action) {
    case "settings.update": {
      const { action: _a, ...patch } = body;
      void _a;
      const row = { event_id: eventId, org_id: a.orgId, ...patch, updated_by: userId, updated_at: new Date().toISOString() };
      const { error } = await db.from("protocol_event_settings").upsert(row, { onConflict: "event_id" });
      if (error) return bad("No se pudo guardar la configuración", 500);
      if (patch.enabled) await db.rpc("protocol_sync_event", { p_event: eventId });
      return NextResponse.json({ ok: true });
    }

    case "person.update": {
      const p = await owned(a, "protocol_people", body.id);
      if (!p) return bad("Asistente no encontrado", 404);
      // Tras el check-in solo owner/admin modifican la identidad (autorización administrativa).
      if (p.ticket_id && s?.lock_after_checkin && !can(a.role, "validateCoverage")) {
        const { data: t } = await db.from("tickets").select("status").eq("id", p.ticket_id as string).maybeSingle();
        if (t?.status === "checked_in") return bad("Este asistente ya hizo check-in; solo un administrador puede modificarlo", 403);
      }
      const { action: _a, id: _i, ...patch } = body;
      void _a; void _i;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      // Una cobertura ya revisada solo la altera la administración (cambiar "¿es pastor?"
      // o la respuesta de cobertura la invalidaría).
      const reviewed = p.coverage_status === "confirmed" || p.coverage_status === "not_confirmed";
      const touchesCoverage = ("is_pastor" in clean && clean.is_pastor !== p.is_pastor) || ("coverage_claim" in clean && clean.coverage_claim !== p.coverage_claim);
      if (reviewed && touchesCoverage && !can(a.role, "validateCoverage")) {
        return bad("La cobertura de esta persona ya fue revisada; solo un administrador puede cambiarla", 403);
      }
      const { error } = await db.from("protocol_people").update({ ...clean, ...admin }).eq("id", body.id).eq("event_id", eventId);
      if (error) return bad(error.message.includes("administrativo") ? "Solo un administrador valida coberturas" : "No se pudo guardar", 400);
      return NextResponse.json({ ok: true });
    }

    case "person.coverage": {
      const p = await owned(a, "protocol_people", body.id);
      if (!p) return bad("Asistente no encontrado", 404);
      const claim = p.coverage_claim === "yes" || p.coverage_claim === "org_confirm" ? p.coverage_claim : "org_confirm";
      const reviewed = body.status !== "pending";
      const { error } = await db.from("protocol_people").update({
        is_pastor: true, coverage_claim: claim, coverage_status: body.status, coverage_note: body.note,
        coverage_reviewed_by: reviewed ? userId : null, coverage_reviewed_at: reviewed ? new Date().toISOString() : null, ...admin,
      }).eq("id", body.id).eq("event_id", eventId);
      if (error) return bad("No se pudo validar la cobertura", 500);
      return NextResponse.json({ ok: true });
    }

    case "guest.create": {
      if (!s?.guests_enabled) return bad("Los invitados especiales están desactivados para este evento", 409);
      const { action: _a, ...g } = body;
      void _a;
      const { data, error } = await db.from("protocol_people").insert({
        ...g, org_id: a.orgId, event_id: eventId, kind: "guest", confirmation_status: "confirmed", ...admin,
      }).select("id").single();
      if (error) return bad("No se pudo crear el invitado", 500);
      return NextResponse.json({ ok: true, id: data.id });
    }

    case "guest.delete": {
      const p = await owned(a, "protocol_people", body.id);
      if (!p || p.kind !== "guest") return bad("Solo se pueden eliminar invitados especiales (no boletos)", 400);
      await db.from("protocol_people").update(admin).eq("id", body.id).eq("event_id", eventId); // registra autor en bitácora
      await db.from("protocol_people").delete().eq("id", body.id).eq("event_id", eventId).eq("kind", "guest");
      return NextResponse.json({ ok: true });
    }

    case "meal.session.create": {
      if (!s?.meals_enabled) return bad("La gestión de comidas está desactivada", 409);
      const { data, error } = await db.from("protocol_meal_sessions").insert({
        org_id: a.orgId, event_id: eventId, name: body.name, starts_at: body.starts_at ?? null, capacity: body.capacity ?? null,
      }).select("id").single();
      if (error) return bad("No se pudo crear la comida", 500);
      return NextResponse.json({ ok: true, id: data.id });
    }

    case "meal.session.delete": {
      if (!(await owned(a, "protocol_meal_sessions", body.id))) return bad("Comida no encontrada", 404);
      await db.from("protocol_meal_sessions").delete().eq("id", body.id).eq("event_id", eventId);
      return NextResponse.json({ ok: true });
    }

    case "meal.invite": {
      if (!(await owned(a, "protocol_meal_sessions", body.session_id))) return bad("Comida no encontrada", 404);
      const { data: ps } = await db.from("protocol_people").select("id").eq("event_id", eventId).in("id", body.person_ids);
      const valid = (ps ?? []).map((p) => p.id as string);
      if (valid.length !== body.person_ids.length) return bad("Alguna persona no pertenece a este evento", 403);
      const rows = valid.map((pid) => ({
        org_id: a.orgId, event_id: eventId, session_id: body.session_id, person_id: pid,
        invitation_type: body.invitation_type, companions_allowed: body.companions_allowed ?? 0, ...admin,
      }));
      // UNIQUE(session, person): reinvitar no duplica.
      const { error } = await db.from("protocol_meal_invitations").upsert(rows, { onConflict: "session_id,person_id", ignoreDuplicates: true });
      if (error) return bad("No se pudo invitar", 500);
      return NextResponse.json({ ok: true, invited: valid.length });
    }

    case "meal.update": {
      if (!(await owned(a, "protocol_meal_invitations", body.id))) return bad("Invitación no encontrada", 404);
      const { action: _a, id: _i, ...patch } = body;
      void _a; void _i;
      const onlyStatus = Object.entries(patch).every(([k, v]) => k === "status" || v === undefined);
      if (!onlyStatus && !can(a.role, "manageMeals")) return bad("Solo puedes cambiar la confirmación", 403);
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const { error } = await db.from("protocol_meal_invitations").update({ ...clean, ...admin }).eq("id", body.id).eq("event_id", eventId);
      if (error) return bad("No se pudo actualizar", 500);
      return NextResponse.json({ ok: true });
    }

    case "meal.uninvite": {
      if (!(await owned(a, "protocol_meal_invitations", body.id))) return bad("Invitación no encontrada", 404);
      await db.from("protocol_meal_invitations").update(admin).eq("id", body.id).eq("event_id", eventId);
      await db.from("protocol_meal_invitations").delete().eq("id", body.id).eq("event_id", eventId);
      return NextResponse.json({ ok: true });
    }

    case "table.save": {
      if (!s?.tables_enabled) return bad("La asignación de mesas está desactivada", 409);
      if (body.session_id && !(await owned(a, "protocol_meal_sessions", body.session_id))) return bad("Comida no encontrada", 404);
      const reserved = body.reserved_seats ?? 0;
      if (reserved > body.capacity) return bad("Los lugares reservados no pueden superar la capacidad");
      const row = { name: body.name, capacity: body.capacity, reserved_seats: reserved, reserved_for: body.reserved_for, session_id: body.session_id ?? null, sort: body.sort ?? 0 };
      if (body.id) {
        if (!(await owned(a, "protocol_tables", body.id))) return bad("Mesa no encontrada", 404);
        const { count } = await db.from("protocol_table_assignments").select("id", { count: "exact", head: true }).eq("table_id", body.id);
        if ((count ?? 0) + reserved > body.capacity && !can(a.role, "overrideCapacity")) {
          return bad(`La mesa ya tiene ${count} persona(s); no puedes reducir la capacidad a ${body.capacity}`, 409);
        }
        const { error } = await db.from("protocol_tables").update(row).eq("id", body.id).eq("event_id", eventId);
        if (error) return bad("No se pudo guardar la mesa", 500);
        return NextResponse.json({ ok: true, id: body.id });
      }
      const { data, error } = await db.from("protocol_tables").insert({ ...row, org_id: a.orgId, event_id: eventId }).select("id").single();
      if (error) return bad("No se pudo crear la mesa", 500);
      return NextResponse.json({ ok: true, id: data.id });
    }

    case "table.delete": {
      if (!(await owned(a, "protocol_tables", body.id))) return bad("Mesa no encontrada", 404);
      await db.from("protocol_tables").delete().eq("id", body.id).eq("event_id", eventId);
      return NextResponse.json({ ok: true });
    }

    case "table.assign": {
      if (!(await owned(a, "protocol_tables", body.table_id))) return bad("Mesa no encontrada", 404);
      if (!(await owned(a, "protocol_people", body.person_id))) return bad("Asistente no encontrado", 404);
      if (body.allow_over && !can(a.role, "overrideCapacity")) return bad("Solo un administrador puede exceder la capacidad", 403);
      const { error } = await db.rpc("protocol_assign_table", {
        p_table: body.table_id, p_person: body.person_id, p_allow_over: !!body.allow_over, p_actor: userId, p_seat: body.seat_label,
      });
      if (error) {
        if (/mesa llena/.test(error.message)) return NextResponse.json({ error: "La mesa está llena", code: "capacity" }, { status: 409 });
        return bad("No se pudo asignar", 500);
      }
      return NextResponse.json({ ok: true });
    }

    case "table.unassign": {
      if (!(await owned(a, "protocol_people", body.person_id))) return bad("Asistente no encontrado", 404);
      await db.from("protocol_table_assignments").update(admin).eq("event_id", eventId).eq("person_id", body.person_id);
      await db.from("protocol_table_assignments").delete().eq("event_id", eventId).eq("person_id", body.person_id);
      return NextResponse.json({ ok: true });
    }

    case "table.suggest": {
      const d = await loadProtocolData(db, eventId);
      const occ = tableOccupancy(d.tables, d.assignments, d.people);
      return NextResponse.json({ ok: true, suggestions: suggestSeating(d.people, occ) });
    }

    case "table.applySuggestions": {
      const tIds = [...new Set(body.pairs.map((p) => p.table_id))];
      const pIds = [...new Set(body.pairs.map((p) => p.person_id))];
      const [{ data: ts }, { data: ps }] = await Promise.all([
        db.from("protocol_tables").select("id").eq("event_id", eventId).in("id", tIds),
        db.from("protocol_people").select("id").eq("event_id", eventId).in("id", pIds),
      ]);
      if ((ts ?? []).length !== tIds.length || (ps ?? []).length !== pIds.length) return bad("Mesa o persona de otro evento", 403);
      let applied = 0; let skipped = 0;
      for (const p of body.pairs) {
        const { error } = await db.rpc("protocol_assign_table", { p_table: p.table_id, p_person: p.person_id, p_allow_over: false, p_actor: userId, p_seat: null });
        if (error) skipped++; else applied++;
      }
      return NextResponse.json({ ok: true, applied, skipped });
    }

    case "link.get": {
      const { data: o } = await db.from("orders").select("id").eq("id", body.order_id).eq("event_id", eventId).maybeSingle();
      if (!o) return bad("Compra no encontrada", 404);
      const url = await attendeesLinkForOrder(db, body.order_id);
      if (!url) return bad("La compra no está pagada o el módulo está inactivo", 409);
      return NextResponse.json({ ok: true, url });
    }
  }
}
