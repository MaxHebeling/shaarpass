/**
 * Resolución de tenant + rol para el módulo de Protocolo (solo servidor).
 *
 * Nunca se confía en un org_id enviado por el navegador: el tenant se deriva del
 * evento (en BD) y el rol de la sesión autenticada. Si la organización dueña del
 * evento no tiene el feature `protocol`, el módulo NO EXISTE (404), igual que para
 * cualquier otra organización.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURE_PROTOCOL, type ProtocolSettings } from "./rules";

export type OrgRole = "owner" | "admin" | "staff" | "scanner";
type Db = ReturnType<typeof createAdminClient>;

/** Matriz de permisos. `scanner` (recepción) no entra al módulo: solo usa el escáner. */
export const PERMISSIONS = {
  view: ["owner", "admin", "staff"],
  editPeople: ["owner", "admin", "staff"],          // asistentes, acompañantes, confirmaciones
  validateCoverage: ["owner", "admin"],             // exclusivo administrativo
  manageGuests: ["owner", "admin"],                 // invitados especiales sin compra
  manageMeals: ["owner", "admin"],
  confirmMeals: ["owner", "admin", "staff"],
  manageTables: ["owner", "admin", "staff"],
  overrideCapacity: ["owner", "admin"],
  settings: ["owner", "admin"],
  export: ["owner", "admin"],
  audit: ["owner", "admin"],
  buyerLinks: ["owner", "admin"],
} as const satisfies Record<string, readonly OrgRole[]>;
export type Permission = keyof typeof PERMISSIONS;

export function can(role: OrgRole, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly OrgRole[]).includes(role);
}

export interface ProtocolAccess {
  ok: true;
  db: Db;
  userId: string;
  role: OrgRole;
  orgId: string;
  event: { id: string; org_id: string; slug: string; title: string; starts_at: string; timezone: string; currency: string };
  /** null si el evento aún no tiene configuración (módulo nunca activado). */
  settings: ProtocolSettings | null;
}
export type AccessResult = ProtocolAccess | { ok: false; status: 401 | 403 | 404; error: string };

export async function orgHasProtocol(db: Db, orgId: string): Promise<boolean> {
  const { data } = await db.from("org_features").select("enabled").eq("org_id", orgId).eq("feature", FEATURE_PROTOCOL).maybeSingle();
  return !!(data as { enabled?: boolean } | null)?.enabled;
}

export async function resolveProtocolAccess(eventId: string, perm: Permission = "view"): Promise<AccessResult> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, status: 404, error: "No encontrado" };
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "No autenticado" };

  const db = createAdminClient();
  const { data: event } = await db
    .from("events").select("id, org_id, slug, title, starts_at, timezone, currency").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, status: 404, error: "No encontrado" };

  const { data: member } = await db
    .from("org_members").select("role").eq("org_id", event.org_id).eq("user_id", user.id).maybeSingle();
  // Mismo 404 para "no es tu evento" y "no tiene el módulo": no se filtra existencia.
  if (!member) return { ok: false, status: 404, error: "No encontrado" };
  if (!(await orgHasProtocol(db, event.org_id))) return { ok: false, status: 404, error: "No encontrado" };

  const role = (member as { role: OrgRole }).role;
  if (!can(role, perm)) return { ok: false, status: 403, error: "No tienes permiso para esta acción" };

  const { data: settings } = await db.from("protocol_event_settings").select("*").eq("event_id", eventId).maybeSingle();
  return { ok: true, db, userId: user.id, role, orgId: event.org_id, event, settings: (settings as ProtocolSettings | null) ?? null };
}

/** ¿El evento tiene el módulo activo? (feature de la org + switch del evento). Nunca lanza. */
export async function eventProtocolEnabled(db: Db, eventId: string): Promise<boolean> {
  try {
    const { data } = await db.rpc("protocol_enabled_for_event", { p_event: eventId });
    return data === true;
  } catch {
    return false;
  }
}
