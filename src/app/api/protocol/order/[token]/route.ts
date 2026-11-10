import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp, retryAfterHeaders } from "@/lib/rateLimit";
import { PERSON_COLUMNS, toPerson } from "@/lib/protocol/data";
import { eventProtocolEnabled } from "@/lib/protocol/access";
import {
  BLOCK_MESSAGE, buyerEditBlock, buyerPayloadSchema, sanitizeBuyerPerson,
  type Person, type ProtocolSettings,
} from "@/lib/protocol/rules";

export const runtime = "nodejs";

/**
 * Registro de asistentes por el COMPRADOR, mediante el enlace secreto que recibe
 * con sus boletos (/asistentes/{token}). El token es un bearer de 256 bits que
 * solo da acceso a los boletos de SU orden; nunca a otras compras ni a datos
 * administrativos (cobertura validada, mesas, notas).
 */
type Db = ReturnType<typeof createAdminClient>;
const TOKEN_RE = /^[0-9a-f]{64}$/;

interface Ctx {
  order: { order_id: string; event_id: string; accompanied: string | null };
  settings: ProtocolSettings;
  event: { title: string; starts_at: string; timezone: string; cover_image: string | null; slug: string };
  people: Person[];
}

async function loadContext(db: Db, token: string): Promise<Ctx | null> {
  if (!TOKEN_RE.test(token)) return null;
  const { data: order } = await db
    .from("protocol_orders").select("order_id, event_id, accompanied").eq("access_token", token).maybeSingle();
  if (!order) return null;
  if (!(await eventProtocolEnabled(db, order.event_id))) return null;
  await db.rpc("protocol_sync_order", { p_order: order.order_id }); // boletos nuevos (idempotente)
  const [{ data: settings }, { data: event }, { data: rows }] = await Promise.all([
    db.from("protocol_event_settings").select("*").eq("event_id", order.event_id).maybeSingle(),
    db.from("events").select("title, starts_at, timezone, cover_image, slug").eq("id", order.event_id).maybeSingle(),
    db.from("protocol_people").select(PERSON_COLUMNS).eq("order_id", order.order_id).eq("kind", "ticket").order("created_at").order("id"),
  ]);
  if (!settings || !event) return null;
  return {
    order, settings: settings as ProtocolSettings, event,
    people: ((rows ?? []) as unknown as Parameters<typeof toPerson>[0][]).map(toPerson),
  };
}

/** Vista pública mínima: solo datos que el propio comprador capturó. */
function publicView(ctx: Ctx, now = new Date()) {
  const s = ctx.settings;
  return {
    event: { title: ctx.event.title, startsAt: ctx.event.starts_at, timezone: ctx.event.timezone, cover: ctx.event.cover_image, slug: ctx.event.slug },
    settings: {
      companions: s.companions_enabled, coverage: s.coverage_enabled, coverageLeader: s.coverage_leader,
      deadline: s.edit_deadline,
    },
    accompanied: ctx.order.accompanied,
    people: ctx.people.map((p, i) => {
      const block = buyerEditBlock(p, s, now);
      return {
        id: p.id, index: i + 1, full_name: p.full_name, email: p.email, phone: p.phone, city: p.city,
        category: p.category, relation: p.relation, is_pastor: p.is_pastor, coverage_claim: p.coverage_claim,
        // El comprador ve si la organización ya revisó, no notas ni revisor.
        coverage_review: p.coverage_status === "confirmed" ? "confirmed" : p.coverage_status === "pending" ? "pending" : null,
        ticket_status: p.ticket_status, checked_in: p.checked_in,
        editable: block === null, blockedReason: block ? BLOCK_MESSAGE[block] : null,
      };
    }),
  };
}

async function limited(req: Request, db: Db, kind: string) {
  const rl = await rateLimit({ key: `protocol-${kind}:${clientIp(req)}`, max: kind === "get" ? 60 : 20, windowSeconds: 60, db });
  return rl.ok ? null : NextResponse.json({ error: "Demasiadas solicitudes, intenta en un momento" }, { status: 429, headers: retryAfterHeaders(rl) });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const rl = await limited(req, db, "get");
  if (rl) return rl;
  const ctx = await loadContext(db, token);
  if (!ctx) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  return NextResponse.json(publicView(ctx), { headers: { "cache-control": "no-store" } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();
  const rl = await limited(req, db, "put");
  if (rl) return rl;
  const ctx = await loadContext(db, token);
  if (!ctx) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });

  const parsed = buyerPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const { accompanied, people } = parsed.data;

  // Solo boletos de ESTA orden. Un id ajeno se rechaza (acceso horizontal).
  const own = new Map(ctx.people.map((p) => [p.id, p]));
  if (new Set(people.map((p) => p.id)).size !== people.length) {
    return NextResponse.json({ error: "Asistente repetido en la solicitud" }, { status: 400 });
  }
  for (const p of people) {
    if (!own.has(p.id)) return NextResponse.json({ error: "Asistente no pertenece a esta compra" }, { status: 403 });
  }

  const errors: { id: string; error: string }[] = [];
  for (const input of people) {
    const current = own.get(input.id)!;
    const block = buyerEditBlock(current, ctx.settings);
    const clean = sanitizeBuyerPerson(input, ctx.settings);
    const changed = (["full_name", "email", "phone", "city", "category", "relation", "is_pastor", "coverage_claim"] as const)
      .some((k) => (clean[k] ?? null) !== (current[k] ?? null));
    if (!changed) continue;
    if (block) { errors.push({ id: input.id, error: BLOCK_MESSAGE[block] }); continue; }
    const { error } = await db.from("protocol_people").update({
      full_name: clean.full_name, email: clean.email, phone: clean.phone, city: clean.city,
      category: clean.category, relation: clean.relation, is_pastor: clean.is_pastor, coverage_claim: clean.coverage_claim,
      updated_by: null, updated_by_kind: "buyer",
    }).eq("id", input.id).eq("order_id", ctx.order.order_id);
    if (error) errors.push({ id: input.id, error: "No se pudo guardar" });
  }

  if (accompanied !== undefined && accompanied !== ctx.order.accompanied && ctx.settings.companions_enabled) {
    await db.from("protocol_orders").update({ accompanied, updated_at: new Date().toISOString() }).eq("order_id", ctx.order.order_id);
  }

  const fresh = await loadContext(db, token);
  return NextResponse.json({ ok: errors.length === 0, errors, ...(fresh ? publicView(fresh) : {}) }, { status: errors.length && errors.length === people.length ? 409 : 200 });
}
