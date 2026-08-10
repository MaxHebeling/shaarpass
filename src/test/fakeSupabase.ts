/**
 * Doble de prueba del cliente de Supabase (postgrest-js) — sin red.
 *
 * Reproduce la parte de la API encadenable que usan las rutas:
 *   db.from(t).select(cols).eq(a, b).single() / .maybeSingle()
 *   db.from(t).insert(row).select(cols).single()
 *   db.from(t).update(row).eq(a, b)
 *   db.rpc(fn, args)
 *
 * El test decide qué devuelve cada consulta con dos resolvers. Todo lo que no
 * resuelvan cae en `{ data: null, error: null }`, que es el "no encontrado"
 * benigno de postgrest. Además registra las llamadas para poder aseverar sobre
 * ellas (`db.queries`, `db.rpcCalls`).
 */

export type QueryOp = "select" | "insert" | "update" | "delete";

export interface QueryContext {
  table: string;
  op: QueryOp;
  /** Filas enviadas en insert/update. */
  payload?: unknown;
  /** Columnas pedidas en select(). */
  columns?: string;
  /** Filtros encadenados, en orden. */
  filters: { method: string; args: unknown[] }[];
  /** Terminador usado, si hubo. */
  single?: "single" | "maybeSingle";
}

export interface DbResult {
  data?: unknown;
  error?: unknown;
}

export type TableResolver = (ctx: QueryContext) => DbResult | undefined;
export type RpcResolver = (fn: string, args: Record<string, unknown>) => DbResult | undefined;

const CHAINABLE = [
  "eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte",
  "like", "ilike", "contains", "order", "limit", "range", "filter", "match",
] as const;

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(
    readonly ctx: QueryContext,
    private readonly resolver: TableResolver,
  ) {
    for (const m of CHAINABLE) {
      (this as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => {
        this.ctx.filters.push({ method: m, args });
        return this;
      };
    }
  }

  select(columns?: string): this {
    // select() después de insert/update es "devuélveme lo insertado", no cambia la op.
    if (this.ctx.op === "select") this.ctx.columns = columns;
    else this.ctx.columns = columns;
    return this;
  }

  single(): this {
    this.ctx.single = "single";
    return this;
  }

  maybeSingle(): this {
    this.ctx.single = "maybeSingle";
    return this;
  }

  private settle(): { data: unknown; error: unknown } {
    const r = this.resolver(this.ctx) ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    onFulfilled?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.settle()).then(onFulfilled, onRejected);
  }
}

export interface FakeDb {
  from(table: string): FakeQuery & Record<string, (...a: unknown[]) => FakeQuery>;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  /** Historial, para aseverar. */
  queries: QueryContext[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
}

export function createFakeDb(opts: { tables?: TableResolver; rpc?: RpcResolver } = {}): FakeDb {
  const queries: QueryContext[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const tableResolver: TableResolver = opts.tables ?? (() => undefined);

  function make(table: string, op: QueryOp, payload?: unknown) {
    const ctx: QueryContext = { table, op, payload, filters: [] };
    queries.push(ctx);
    return new FakeQuery(ctx, tableResolver) as FakeQuery & Record<string, (...a: unknown[]) => FakeQuery>;
  }

  return {
    from(table: string) {
      const base = make(table, "select");
      // from(t) puede continuar con .select/.insert/.update/.delete
      const withOps = base as unknown as Record<string, unknown>;
      withOps.insert = (rows: unknown) => {
        base.ctx.op = "insert";
        base.ctx.payload = rows;
        return base;
      };
      withOps.update = (row: unknown) => {
        base.ctx.op = "update";
        base.ctx.payload = row;
        return base;
      };
      withOps.delete = () => {
        base.ctx.op = "delete";
        return base;
      };
      return base;
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ fn, args });
      const r = opts.rpc?.(fn, args) ?? {};
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
    queries,
    rpcCalls,
  };
}

/** Azúcar: resolver por tabla+operación. */
export function byTable(map: Record<string, TableResolver>): TableResolver {
  return (ctx) => map[ctx.table]?.(ctx);
}
