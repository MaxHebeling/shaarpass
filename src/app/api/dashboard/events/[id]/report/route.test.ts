/**
 * Exportación a Excel de compradores: autenticación, permisos por rol (importes
 * solo owner/admin), aislamiento por evento/organización, filtros, paginación
 * (>1000 filas) y archivo .xlsx válido con cantidad y total pagado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb, type QueryContext } from "@/test/fakeSupabase";
import { readWorkbook, rowByLabel, tableObjects } from "@/test/xlsxRead";

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  db: null as unknown as FakeDb,
  role: "owner" as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));

import { GET } from "./route";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_EVENT = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;
let orders: Row[] = [];
let items: Row[] = [];
let tickets: Row[] = [];

/** Aplica eq/in y range como lo haría PostgREST (incluye filtros por tabla embebida). */
function query(ctx: QueryContext, rows: Row[], joined?: (r: Row) => Row | undefined) {
  let out = rows;
  for (const f of ctx.filters) {
    if (f.method === "eq") {
      const [col, val] = f.args as [string, unknown];
      if (col.startsWith("orders.")) {
        const k = col.slice("orders.".length);
        out = out.filter((r) => joined?.(r)?.[k] === val);
      } else out = out.filter((r) => r[col] === val);
    }
  }
  const range = ctx.filters.find((f) => f.method === "range")?.args as [number, number] | undefined;
  if (range) out = out.slice(range[0], range[1] + 1);
  return { data: out };
}

function setup() {
  h.user = { id: "user-1" };
  h.role = "owner";
  orders = [
    { id: "o-ana", event_id: EVENT_ID, org_id: ORG_ID, buyer_name: "Ana López", buyer_email: "ana@test.mx", buyer_phone: "+52 55 1234", status: "paid", subtotal_cents: 70000, discount_cents: 0, total_cents: 73000, created_at: "2026-11-01T18:00:00Z", paid_at: "2026-11-01T18:05:00Z", payment_method: "card", custom_data: { f_talla: "M" } },
    { id: "o-beto", event_id: EVENT_ID, org_id: ORG_ID, buyer_name: "Beto", buyer_email: "beto@test.mx", buyer_phone: null, status: "awaiting_payment", subtotal_cents: 20000, discount_cents: 0, total_cents: 21000, created_at: "2026-11-02T18:00:00Z", paid_at: null, payment_method: "oxxo", custom_data: {} },
    // De OTRO evento y de OTRA organización: nunca deben aparecer.
    { id: "o-otro-evento", event_id: OTHER_EVENT, org_id: ORG_ID, buyer_name: "Intruso Evento", buyer_email: "x@test.mx", buyer_phone: null, status: "paid", subtotal_cents: 99900, discount_cents: 0, total_cents: 99900, created_at: "2026-11-01T00:00:00Z", paid_at: "2026-11-01T00:00:00Z", payment_method: "card", custom_data: {} },
    { id: "o-otra-org", event_id: EVENT_ID, org_id: OTHER_ORG, buyer_name: "Intruso Org", buyer_email: "y@test.mx", buyer_phone: null, status: "paid", subtotal_cents: 88800, discount_cents: 0, total_cents: 88800, created_at: "2026-11-01T00:00:00Z", paid_at: "2026-11-01T00:00:00Z", payment_method: "card", custom_data: {} },
  ];
  items = [
    { id: "i1", order_id: "o-ana", ticket_type_id: "tt-vip", quantity: 1, unit_price_cents: 50000 },
    { id: "i2", order_id: "o-ana", ticket_type_id: "tt-gen", quantity: 1, unit_price_cents: 20000 },
    { id: "i3", order_id: "o-beto", ticket_type_id: "tt-gen", quantity: 1, unit_price_cents: 20000 },
    { id: "i4", order_id: "o-otro-evento", ticket_type_id: "tt-x", quantity: 9, unit_price_cents: 11100 },
    { id: "i5", order_id: "o-otra-org", ticket_type_id: "tt-gen", quantity: 8, unit_price_cents: 11100 },
  ];
  tickets = [
    { id: "t1", order_id: "o-ana", event_id: EVENT_ID, status: "valid" },
    { id: "t2", order_id: "o-ana", event_id: EVENT_ID, status: "checked_in" },
    { id: "t3", order_id: "o-otra-org", event_id: EVENT_ID, status: "valid" },
  ];
  const orderOf = (r: Row) => orders.find((o) => o.id === r.order_id);
  h.db = createFakeDb({
    tables: (ctx) => {
      if (ctx.table === "events") return { data: { id: EVENT_ID, slug: "gran-evento", title: "Gran Evento", org_id: ORG_ID, currency: "mxn", timezone: "America/Mexico_City", custom_fields: [{ key: "f_talla", label: "Talla", type: "text", required: false }] } };
      if (ctx.table === "org_members") return { data: h.role ? { user_id: "user-1", role: h.role } : null };
      if (ctx.table === "orders") return query(ctx, orders);
      if (ctx.table === "order_items") return query(ctx, items, orderOf);
      if (ctx.table === "tickets") return query(ctx, tickets);
      if (ctx.table === "ticket_types") return { data: [{ id: "tt-vip", name: "VIP" }, { id: "tt-gen", name: "General" }] };
      return undefined;
    },
  });
}

function get(qs = "") {
  return GET(new Request(`https://www.shaarpass.io/api/dashboard/events/${EVENT_ID}/report${qs}`), { params: Promise.resolve({ id: EVENT_ID }) });
}
async function book(qs = "") {
  const res = await get(qs);
  expect(res.status).toBe(200);
  return readWorkbook(Buffer.from(await res.arrayBuffer()));
}

beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("seguridad", () => {
  it("sin sesión → 401", async () => {
    h.user = null;
    expect((await get()).status).toBe(401);
  });

  it("no miembro de la organización del evento → 403", async () => {
    h.role = null;
    expect((await get()).status).toBe(403);
  });

  it("14) aislamiento: filtra por evento Y organización; nada de otros eventos u organizaciones", async () => {
    const sheets = await book();
    const all = sheets.map((s) => s.xml).join("");
    expect(all).not.toContain("Intruso");
    const oq = h.db.queries.find((q) => q.table === "orders")!;
    expect(oq.filters).toEqual(expect.arrayContaining([
      { method: "eq", args: ["event_id", EVENT_ID] }, { method: "eq", args: ["org_id", ORG_ID] },
    ]));
    const iq = h.db.queries.find((q) => q.table === "order_items")!;
    expect(iq.filters).toEqual(expect.arrayContaining([
      { method: "eq", args: ["orders.event_id", EVENT_ID] }, { method: "eq", args: ["orders.org_id", ORG_ID] },
    ]));
    // El boleto de la orden de otra org (mismo event_id) se descarta.
    const resumen = sheets.find((s) => s.name === "Resumen")!;
    expect(rowByLabel(resumen, "Boletos emitidos vigentes (de compras pagadas)")?.[1]).toBe(2);
  });

  it("15) staff/scanner: mismo reporte sin columnas ni filas de dinero", async () => {
    h.role = "staff";
    const sheets = await book();
    const buyers = tableObjects(sheets[0], "N.º");
    expect(buyers[0]["Cantidad de boletos"]).toBe(2);
    expect(Object.keys(buyers[0])).not.toContain("Total pagado");
    expect(Object.keys(buyers[0])).not.toContain("Precio unitario");
    const resumen = sheets.find((s) => s.name === "Resumen")!;
    expect(rowByLabel(resumen, /Importe/)).toBeUndefined();
    expect(sheets.map((s) => s.xml).join("")).not.toContain("73000");
    for (const role of ["admin", "owner"]) {
      h.role = role;
      const t = tableObjects((await book())[0], "N.º");
      expect(t[0]["Total pagado"]).toBe(730);
    }
  });
});

describe("contenido", () => {
  it("13) .xlsx válido con las 4 hojas y encabezados", async () => {
    const res = await get();
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="compradores-gran-evento-\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const sheets = readWorkbook(Buffer.from(await res.arrayBuffer()));
    expect(sheets.map((s) => s.name)).toEqual(["Compradores", "Resumen", "Por tipo de boleto", "Lista de acceso"]);
  });

  it("recupera cantidad de boletos y total pagado por comprador", async () => {
    const [buyers] = await book();
    const t = tableObjects(buyers, "N.º");
    expect(t.map((r) => r.Comprador)).toEqual(["Ana López", "Beto"]);
    expect(t[0]).toMatchObject({
      "Correo electrónico": "ana@test.mx", "Teléfono": "+52 55 1234", Evento: "Gran Evento",
      "Tipo de boleto": "VIP ×1, General ×1", "Cantidad de boletos": 2, "Subtotal (boletos)": 700,
      Descuentos: 0, "Cargos y extras": 30, "Total de la orden": 730, "Total pagado": 730, "Pendiente de cobro": 0,
      "Estado del pago": "Pagado", "Método de pago": "Tarjeta", "Estado de boletos": "1 vigente · 1 usado", Talla: "M",
    });
    expect(t[0]["Precio unitario"]).toBeNull(); // mezcla de precios: vacío, no 0
    expect(typeof t[0]["Fecha de compra"]).toBe("number"); // fecha real de Excel
    expect(t[1]).toMatchObject({ "Total pagado": 0, "Pendiente de cobro": 210, "Estado del pago": "Pendiente de pago" });
    const totals = rowByLabel(buyers, /^TOTALES/)!;
    const heads = buyers.rows.find((r) => r?.[0] === "N.º")!;
    expect(totals[heads.indexOf("Cantidad de boletos")]).toBe(3);
    expect(totals[heads.indexOf("Total pagado")]).toBe(730);
  });

  it("10) respeta filtros (estado + búsqueda); la lista de acceso solo incluye pagadas", async () => {
    const sheets = await book("?status=pending");
    expect(tableObjects(sheets[0], "N.º").map((r) => r.Comprador)).toEqual(["Beto"]);
    expect(sheets[1].rows[1]?.[0]).toContain("Pendientes de pago");
    expect(tableObjects(sheets[3], "N.º").map((r) => r.Comprador)).toEqual(["Ana López"]);
    const s2 = await book("?q=beto");
    expect(tableObjects(s2[0], "N.º").map((r) => r.Comprador)).toEqual(["Beto"]);
    expect(tableObjects(s2[3], "N.º")).toEqual([]);
  });

  it("vista para imprimir: solo la lista de acceso, horizontal, ajustada al ancho", async () => {
    const res = await get("?view=print");
    expect(res.headers.get("content-disposition")).toContain("lista-acceso-gran-evento-");
    const sheets = readWorkbook(Buffer.from(await res.arrayBuffer()));
    expect(sheets.map((s) => s.name)).toEqual(["Lista de acceso"]);
    expect(sheets[0].xml).toContain(`orientation="landscape" fitToWidth="1"`);
    const t = tableObjects(sheets[0], "N.º");
    expect(t).toEqual([expect.objectContaining({ Comprador: "Ana López", Boletos: 2, Llegó: "☐", Notas: "1 ya registrado(s)" })]);
  });

  it("pagina más de 1000 órdenes sin perder ni duplicar filas", async () => {
    orders = Array.from({ length: 2345 }, (_, i) => ({
      id: `o-${String(i).padStart(5, "0")}`, event_id: EVENT_ID, org_id: ORG_ID, buyer_name: `Persona ${i}`, buyer_email: `p${i}@test.mx`, buyer_phone: null,
      status: "paid", subtotal_cents: 10000, discount_cents: 0, total_cents: 10000, created_at: "2026-11-01T00:00:00Z", paid_at: "2026-11-01T00:00:00Z", payment_method: "card", custom_data: {},
    }));
    items = orders.map((o, i) => ({ id: `i-${i}`, order_id: o.id, ticket_type_id: "tt-gen", quantity: 2, unit_price_cents: 5000 }));
    tickets = orders.flatMap((o, i) => [{ id: `t-${i}-a`, order_id: o.id, event_id: EVENT_ID, status: "valid" }, { id: `t-${i}-b`, order_id: o.id, event_id: EVENT_ID, status: "valid" }]);
    const sheets = await book();
    expect(tableObjects(sheets[0], "N.º")).toHaveLength(2345);
    const resumen = sheets[1];
    expect(rowByLabel(resumen, "Boletos vendidos (pagados + cortesía)")?.[1]).toBe(4690);
    expect(rowByLabel(resumen, "Importe efectivamente cobrado")?.[1]).toBe(234500);
    expect(rowByLabel(resumen, "Diferencia")?.[1]).toBe(0);
    expect(h.db.queries.filter((q) => q.table === "orders")).toHaveLength(3);
  });

  it("error de base de datos → 500 sin filtrar detalles", async () => {
    h.db = createFakeDb({
      tables: (ctx) => {
        if (ctx.table === "events") return { data: { id: EVENT_ID, slug: "x", title: "X", org_id: ORG_ID, currency: "mxn", timezone: "America/Mexico_City", custom_fields: [] } };
        if (ctx.table === "org_members") return { data: { user_id: "user-1", role: "owner" } };
        if (ctx.table === "orders") return { error: { message: "boom secreto" } };
        return { data: [] };
      },
    });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("boom");
  });
});
