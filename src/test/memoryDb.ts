/**
 * Base en memoria sobre `createFakeDb`: aplica filtros eq/in a filas reales para que
 * las pruebas de rutas verifiquen el aislamiento (un id ajeno simplemente no aparece).
 */
import { createFakeDb, type FakeDb, type QueryContext, type RpcResolver } from "./fakeSupabase";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

function matches(row: Row, ctx: QueryContext): boolean {
  return ctx.filters.every(({ method, args }) => {
    const [col, val] = args as [string, unknown];
    if (method === "eq") return col.includes(".") ? true : row[col] === val;
    if (method === "in") return (val as unknown[]).includes(row[col]);
    return true; // order/limit/etc.
  });
}

export function createMemoryDb(tables: Tables, rpc?: RpcResolver): FakeDb & { tables: Tables } {
  let seq = 0;
  const db = createFakeDb({
    rpc,
    tables: (ctx) => {
      const rows = (tables[ctx.table] ??= []);
      if (ctx.op === "select") {
        const hit = rows.filter((r) => matches(r, ctx));
        return { data: ctx.single ? hit[0] ?? null : hit };
      }
      if (ctx.op === "update") {
        const hit = rows.filter((r) => matches(r, ctx));
        hit.forEach((r) => Object.assign(r, ctx.payload as Row));
        return { data: null };
      }
      if (ctx.op === "delete") {
        tables[ctx.table] = rows.filter((r) => !matches(r, ctx));
        return { data: null };
      }
      if (ctx.op === "insert" || ctx.op === "upsert") {
        const list = (Array.isArray(ctx.payload) ? ctx.payload : [ctx.payload]) as Row[];
        const created = list.map((r) => ({ id: `mem-${++seq}`, ...r }));
        rows.push(...created);
        return { data: ctx.single ? created[0] : created };
      }
      return undefined;
    },
  });
  return Object.assign(db, { tables });
}
