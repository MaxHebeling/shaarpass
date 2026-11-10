/**
 * Prueba la migración 0013 contra Postgres real (PGlite): aislamiento por tenant,
 * idempotencia, un asistente por boleto, cobertura pastoral, capacidad de mesas,
 * duplicados en comidas, RLS entre organizaciones y bitácora.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createPgWithMigrations, asUser } from "@/test/pgFixture";

const FDV_SLUG = "ministerio-internacional-fuente-de-vida-0530b4";
const U = {
  fdvAdmin: "a0000000-0000-4000-8000-000000000001",
  fdvStaff: "a0000000-0000-4000-8000-000000000002",
  fdvScanner: "a0000000-0000-4000-8000-000000000003",
  otherOwner: "b0000000-0000-4000-8000-000000000001",
};

let db: PGlite;
let fdv: string, other: string, ev: string, ev2: string, otherEv: string, tt: string, otherTt: string;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<T>(sql, params);
  return r.rows[0];
}
async function expectError(sql: string, params: unknown[], match: RegExp) {
  await expect(db.query(sql, params)).rejects.toThrow(match);
}
/** Crea una orden pagada con N boletos válidos. */
async function paidOrder(eventId: string, typeId: string, orgId: string, n: number, buyer = "Pastor Eleonardo Martínez") {
  const o = await one<{ id: string }>(
    `insert into orders (event_id, org_id, buyer_email, buyer_name, buyer_city, status) values ($1,$2,'p@x.mx',$3,'Saltillo','paid') returning id`,
    [eventId, orgId, buyer]);
  for (let i = 0; i < n; i++) await db.query(`insert into tickets (order_id, ticket_type_id, event_id) values ($1,$2,$3)`, [o.id, typeId, eventId]);
  return o.id;
}

beforeAll(async () => {
  db = await createPgWithMigrations([]);
  // Orgs ANTES de la migración: el flag se habilita por slug al migrar.
  fdv = (await one<{ id: string }>(`insert into organizations (slug, name) values ($1,'Ministerio Internacional Fuente de Vida') returning id`, [FDV_SLUG])).id;
  other = (await one<{ id: string }>(`insert into organizations (slug, name) values ('soundwave','SoundWave') returning id`)).id;
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  for (const f of ["0013_protocol_module.sql", "0014_protocol_revoke_rpc.sql"]) {
    await db.exec(readFileSync(fileURLToPath(new URL(`../../../supabase/migrations/${f}`, import.meta.url)), "utf8"));
  }

  await db.query(`insert into org_members values ($1,$2,'admin'),($1,$3,'staff'),($1,$4,'scanner'),($5,$6,'owner')`,
    [fdv, U.fdvAdmin, U.fdvStaff, U.fdvScanner, other, U.otherOwner]);
  ev = (await one<{ id: string }>(`insert into events (org_id, slug, title) values ($1,'raf','RAF') returning id`, [fdv])).id;
  ev2 = (await one<{ id: string }>(`insert into events (org_id, slug, title) values ($1,'escuela','Escuela') returning id`, [fdv])).id;
  otherEv = (await one<{ id: string }>(`insert into events (org_id, slug, title) values ($1,'concierto','Concierto') returning id`, [other])).id;
  tt = (await one<{ id: string }>(`insert into ticket_types (event_id, name) values ($1,'General') returning id`, [ev])).id;
  otherTt = (await one<{ id: string }>(`insert into ticket_types (event_id, name) values ($1,'General') returning id`, [otherEv])).id;
  await db.query(`insert into protocol_event_settings (event_id, org_id, enabled, meals_enabled, tables_enabled) values ($1,$2,true,true,true)`, [ev, fdv]);
});

describe("aislamiento multitenant", () => {
  it("el feature se habilita SOLO para Fuente de Vida (por slug)", async () => {
    const r = await db.query<{ org_id: string }>(`select org_id from org_features where feature='protocol'`);
    expect(r.rows.map((x) => x.org_id)).toEqual([fdv]);
  });

  it("otra organización no puede tener configuración ni registros de protocolo", async () => {
    await expectError(`insert into protocol_event_settings (event_id, org_id, enabled) values ($1,$2,true)`, [otherEv, other], /no habilitado/);
    await expectError(`insert into protocol_people (org_id, event_id, kind, full_name) values ($1,$2,'guest','X')`, [other, otherEv], /no habilitado/);
  });

  it("no se puede etiquetar un evento ajeno con el org de Fuente de Vida", async () => {
    await expectError(`insert into protocol_people (org_id, event_id, kind, full_name) values ($1,$2,'guest','X')`, [fdv, otherEv], /no coincide/);
  });

  it("órdenes de otros tenants o de eventos no habilitados no se sincronizan", async () => {
    const o = await paidOrder(otherEv, otherTt, other, 2);
    expect((await one<{ t: string | null }>(`select protocol_sync_order($1) t`, [o])).t).toBeNull();
    const tt2 = (await one<{ id: string }>(`insert into ticket_types (event_id, name) values ($1,'G') returning id`, [ev2])).id;
    const o2 = await paidOrder(ev2, tt2, fdv, 1);
    expect((await one<{ t: string | null }>(`select protocol_sync_order($1) t`, [o2])).t).toBeNull();
    expect((await one<{ c: number }>(`select count(*)::int c from protocol_people where order_id in ($1,$2)`, [o, o2])).c).toBe(0);
  });

  it("RLS: otro tenant, el escáner y anon no ven datos; admin/staff sí; el token solo lo ve admin", async () => {
    await paidOrder(ev, tt, fdv, 1);
    await db.query(`select protocol_sync_event($1)`, [ev]);
    const count = (sql: string) => db.query<{ c: number }>(sql).then((r) => r.rows[0].c);
    const people = `select count(*)::int c from protocol_people`;
    const tokens = `select count(*)::int c from protocol_orders`;
    expect(await asUser(db, U.otherOwner, () => count(people))).toBe(0);
    expect(await asUser(db, U.otherOwner, () => count(tokens))).toBe(0);
    expect(await asUser(db, U.fdvScanner, () => count(people))).toBe(0);
    expect(await asUser(db, U.fdvStaff, () => count(people))).toBeGreaterThan(0);
    expect(await asUser(db, U.fdvStaff, () => count(tokens))).toBe(0);
    expect(await asUser(db, U.fdvAdmin, () => count(tokens))).toBeGreaterThan(0);
    await expect(asUser(db, null, () => count(people))).rejects.toThrow(/permission denied/);
  });

  it("anon y usuarios autenticados no pueden invocar las funciones del módulo (p. ej. obtener tokens)", async () => {
    const o = await paidOrder(ev, tt, fdv, 1);
    for (const who of [null, U.fdvAdmin, U.otherOwner]) {
      await expect(asUser(db, who, () => db.query(`select protocol_sync_order($1)`, [o]))).rejects.toThrow(/permission denied/);
      await expect(asUser(db, who, () => db.query(`select protocol_enabled_for_event($1)`, [ev]))).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(db, null, () => db.query(`select org_has_feature($1,'protocol')`, [fdv]))).rejects.toThrow(/permission denied/);
  });

  it("RLS: ningún usuario autenticado escribe directo (solo el servidor)", async () => {
    await expect(asUser(db, U.fdvAdmin, () => db.query(`update protocol_people set full_name='hack'`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, U.fdvAdmin, () => db.query(`select protocol_sync_event($1)`, [ev]))).rejects.toThrow(/permission denied/);
  });
});

describe("asistentes por boleto", () => {
  it("una compra de 3 boletos genera 3 registros; el 1º con el comprador; reintentos no duplican", async () => {
    const o = await paidOrder(ev, tt, fdv, 3);
    const t1 = (await one<{ t: string }>(`select protocol_sync_order($1) t`, [o])).t;
    const t2 = (await one<{ t: string }>(`select protocol_sync_order($1) t`, [o])).t; // webhook repetido
    await db.query(`select protocol_sync_event($1)`, [ev]);
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).toBe(t1);
    const rows = (await db.query<{ full_name: string | null; category: string | null; city: string }>(
      `select full_name, category, city from protocol_people where order_id=$1 order by created_at, id`, [o])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.full_name === "Pastor Eleonardo Martínez")).toHaveLength(1);
    expect(rows.filter((r) => r.full_name === null)).toHaveLength(2);
  });

  it("un boleto no puede asignarse a dos personas a la vez", async () => {
    const o = await paidOrder(ev, tt, fdv, 1);
    await db.query(`select protocol_sync_order($1)`, [o]);
    const t = await one<{ id: string }>(`select id from tickets where order_id=$1`, [o]);
    await expectError(`insert into protocol_people (org_id, event_id, kind, ticket_id, full_name) values ($1,$2,'ticket',$3,'Otra')`, [fdv, ev, t.id], /duplicate key|unique/);
  });

  it("un invitado especial nunca ocupa un boleto ajeno a su evento", async () => {
    const o = await paidOrder(otherEv, otherTt, other, 1);
    const t = await one<{ id: string }>(`select id from tickets where order_id=$1`, [o]);
    await expectError(`insert into protocol_people (org_id, event_id, kind, ticket_id, full_name) values ($1,$2,'ticket',$3,'X')`, [fdv, ev, t.id], /no pertenece/);
  });

  it("boletos reembolsados no generan asistentes", async () => {
    const o = await paidOrder(ev, tt, fdv, 2);
    await db.query(`update tickets set status='refunded' where order_id=$1`, [o]);
    await db.query(`select protocol_sync_order($1)`, [o]);
    expect((await one<{ c: number }>(`select count(*)::int c from protocol_people where order_id=$1`, [o])).c).toBe(0);
  });

  it("sustituir al acompañante conserva boleto/orden y lo refleja en attendees; queda en bitácora", async () => {
    const o = await paidOrder(ev, tt, fdv, 2);
    await db.query(`select protocol_sync_order($1)`, [o]);
    const p = await one<{ id: string; ticket_id: string }>(`select id, ticket_id from protocol_people where order_id=$1 and full_name is null`, [o]);
    await db.query(`update protocol_people set full_name='María López', category='spouse', updated_by_kind='buyer' where id=$1`, [p.id]);
    await db.query(`update protocol_people set full_name='Pedro Ramírez', category='leader', updated_by_kind='buyer' where id=$1`, [p.id]);
    const after = await one<{ ticket_id: string; order_id: string; first_name: string }>(
      `select pp.ticket_id, pp.order_id, a.first_name from protocol_people pp join tickets t on t.id=pp.ticket_id join attendees a on a.id=t.attendee_id where pp.id=$1`, [p.id]);
    expect(after).toMatchObject({ ticket_id: p.ticket_id, order_id: o, first_name: "Pedro Ramírez" });
    expect((await one<{ c: number }>(`select count(*)::int c from tickets where order_id=$1`, [o])).c).toBe(2);
    const log = await db.query<{ before: { full_name: string }; after: { full_name: string } }>(
      `select before, after from protocol_audit_log where entity_id=$1 and action='update' order by id`, [p.id]);
    expect(log.rows.map((r) => [r.before.full_name, r.after.full_name])).toEqual([[null, "María López"], ["María López", "Pedro Ramírez"]]);
  });
});

describe("cobertura pastoral", () => {
  let pid: string;
  beforeAll(async () => {
    pid = (await one<{ id: string }>(`insert into protocol_people (org_id, event_id, kind, full_name) values ($1,$2,'guest','Pastor Ricardo Sánchez') returning id`, [fdv, ev])).id;
  });

  it("marcar la opción solo deja la cobertura pendiente (ser pastor ≠ estar bajo cobertura)", async () => {
    const r = await one<{ coverage_status: string }>(`update protocol_people set is_pastor=true, coverage_claim='yes', updated_by_kind='buyer' where id=$1 returning coverage_status`, [pid]);
    expect(r.coverage_status).toBe("pending");
    const r2 = await one<{ coverage_status: string }>(`update protocol_people set coverage_claim='org_confirm' where id=$1 returning coverage_status`, [pid]);
    expect(r2.coverage_status).toBe("pending");
  });

  it("un no-admin no puede confirmar cobertura", async () => {
    await expectError(`update protocol_people set coverage_status='confirmed', coverage_reviewed_by=$2, updated_by_kind='buyer' where id=$1`, [pid, U.fdvStaff], /administrativo/);
    await expectError(`update protocol_people set coverage_status='confirmed', updated_by_kind='admin' where id=$1`, [pid], /administrativo|coverage_review/);
  });

  it("admin confirma; pastor sin cobertura y no-pastor quedan 'no aplica'", async () => {
    const r = await one<{ coverage_status: string }>(`update protocol_people set coverage_status='confirmed', coverage_reviewed_by=$2, coverage_reviewed_at=now(), updated_by_kind='admin', updated_by=$2 where id=$1 returning coverage_status`, [pid, U.fdvAdmin]);
    expect(r.coverage_status).toBe("confirmed");
    const r2 = await one<{ coverage_status: string }>(`update protocol_people set coverage_claim='no', updated_by_kind='buyer' where id=$1 returning coverage_status`, [pid]);
    expect(r2.coverage_status).toBe("not_applicable");
    const r3 = await one<{ coverage_status: string }>(`update protocol_people set is_pastor=false, coverage_claim='yes' where id=$1 returning coverage_status`, [pid]);
    expect(r3.coverage_status).toBe("not_applicable");
  });
});

describe("comidas y mesas", () => {
  let session: string, table: string, table2: string, people: string[];
  beforeAll(async () => {
    session = (await one<{ id: string }>(`insert into protocol_meal_sessions (org_id, event_id, name) values ($1,$2,'Comida pastoral') returning id`, [fdv, ev])).id;
    table = (await one<{ id: string }>(`insert into protocol_tables (org_id, event_id, name, capacity) values ($1,$2,'Mesa 01',2) returning id`, [fdv, ev])).id;
    table2 = (await one<{ id: string }>(`insert into protocol_tables (org_id, event_id, name, capacity, reserved_seats) values ($1,$2,'Mesa 02',3,2) returning id`, [fdv, ev])).id;
    people = [];
    for (const n of ["A", "B", "C", "D"]) people.push((await one<{ id: string }>(`insert into protocol_people (org_id, event_id, kind, full_name) values ($1,$2,'guest',$3) returning id`, [fdv, ev, n])).id);
  });

  it("una persona no puede tener dos invitaciones a la misma comida", async () => {
    await db.query(`insert into protocol_meal_invitations (org_id, event_id, session_id, person_id) values ($1,$2,$3,$4)`, [fdv, ev, session, people[0]]);
    await expectError(`insert into protocol_meal_invitations (org_id, event_id, session_id, person_id) values ($1,$2,$3,$4)`, [fdv, ev, session, people[0]], /duplicate key|unique/);
  });

  it("no mezcla eventos: persona de otro evento no se invita ni se sienta", async () => {
    const g = (await one<{ id: string }>(`insert into protocol_people (org_id, event_id, kind, full_name) values ($1,$2,'guest','Z') returning id`, [fdv, ev2])).id;
    await expectError(`insert into protocol_meal_invitations (org_id, event_id, session_id, person_id) values ($1,$2,$3,$4)`, [fdv, ev, session, g], /no pertenece/);
    await expectError(`select protocol_assign_table($1,$2,false,$3)`, [table, g, U.fdvAdmin], /no pertenece/);
  });

  it("nunca supera la capacidad sin autorización explícita; contar reservados", async () => {
    await db.query(`select protocol_assign_table($1,$2,false,$3)`, [table, people[0], U.fdvAdmin]);
    await db.query(`select protocol_assign_table($1,$2,false,$3)`, [table, people[1], U.fdvAdmin]);
    await expectError(`select protocol_assign_table($1,$2,false,$3)`, [table, people[2], U.fdvAdmin], /mesa llena/);
    const r = await one<{ r: string }>(`select protocol_assign_table($1,$2,true,$3) r`, [table, people[2], U.fdvAdmin]);
    expect(r.r).toBe("ok");
    expect((await one<{ over_capacity: boolean }>(`select over_capacity from protocol_table_assignments where person_id=$1`, [people[2]])).over_capacity).toBe(true);
    // Mesa 02: capacidad 3 con 2 reservados → solo 1 lugar libre.
    await db.query(`select protocol_assign_table($1,$2,false,$3)`, [table2, people[3], U.fdvAdmin]);
    await expectError(`select protocol_assign_table($1,$2,false,$3)`, [table2, people[1], U.fdvAdmin], /mesa llena/);
  });

  it("cambiar de mesa mueve (no duplica) a la persona", async () => {
    await db.query(`delete from protocol_table_assignments where person_id=$1`, [people[3]]);
    await db.query(`select protocol_assign_table($1,$2,false,$3)`, [table2, people[1], U.fdvAdmin]);
    const rows = await db.query<{ table_id: string }>(`select table_id from protocol_table_assignments where person_id=$1`, [people[1]]);
    expect(rows.rows).toEqual([{ table_id: table2 }]);
  });
});
