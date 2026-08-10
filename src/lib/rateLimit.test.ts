import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  rateLimit,
  windowKey,
  retryAfterSeconds,
  clientIp,
  __resetRateLimitClient,
  type RateLimitStore,
} from "./rateLimit";

/** Store en memoria que imita INCR con ventanas por bucket. */
function memoryStore(): RateLimitStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async hit(key) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
  };
}

const brokenStore: RateLimitStore = {
  async hit() {
    throw new Error("upstash caído");
  },
};

/** Cliente Supabase falso: solo `rpc`. */
function fakeDb(reply: { data?: unknown; error?: unknown } | (() => never)) {
  const rpc = vi.fn(async () => {
    if (typeof reply === "function") reply();
    return { data: (reply as { data?: unknown }).data ?? null, error: (reply as { error?: unknown }).error ?? null };
  });
  return { rpc: rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>, calls: rpc };
}

beforeEach(() => {
  __resetRateLimitClient();
  vi.restoreAllMocks();
});

describe("helpers puros", () => {
  it("la clave cambia al cruzar la ventana y es estable dentro de ella", () => {
    const w = 60;
    const base = 999_999_960_000; // alineado al inicio de una ventana de 60s
    const a = windowKey("lead:1.1.1.1", w, base);
    const b = windowKey("lead:1.1.1.1", w, base + 30_000); // +30s, mismo bucket
    const c = windowKey("lead:1.1.1.1", w, base + 70_000); // +70s, otro bucket
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("Retry-After nunca es 0 y no excede la ventana", () => {
    for (const now of [0, 1, 59_999, 60_000, 123_456_789]) {
      const s = retryAfterSeconds(60, now);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(60);
    }
  });

  it("clientIp toma la primera IP de x-forwarded-for", () => {
    const req = new Request("https://x.test", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(clientIp(req)).toBe("9.9.9.9");
    expect(clientIp(new Request("https://x.test"))).toBe("local");
  });
});

describe("rateLimit con Upstash", () => {
  it("permite hasta max y bloquea a partir de max+1", async () => {
    const store = memoryStore();
    const at = 1_000_000_000_000;
    const call = () => rateLimit({ key: "lead:ip", max: 3, windowSeconds: 60, store, now: at });

    expect((await call()).ok).toBe(true);
    expect((await call()).ok).toBe(true);
    expect((await call()).ok).toBe(true);
    const blocked = await call();
    expect(blocked.ok).toBe(false);
    expect(blocked.backend).toBe("upstash");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("la siguiente ventana vuelve a permitir", async () => {
    const store = memoryStore();
    const base = 1_000_000_000_000;
    for (let i = 0; i < 4; i++) await rateLimit({ key: "k", max: 3, windowSeconds: 60, store, now: base });
    const next = await rateLimit({ key: "k", max: 3, windowSeconds: 60, store, now: base + 60_000 });
    expect(next.ok).toBe(true);
  });

  it("claves distintas no se pisan", async () => {
    const store = memoryStore();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 5; i++) await rateLimit({ key: "a", max: 2, windowSeconds: 60, store, now });
    expect((await rateLimit({ key: "b", max: 2, windowSeconds: 60, store, now })).ok).toBe(true);
  });
});

describe("degradación graciosa", () => {
  it("sin Upstash usa el RPC de Postgres", async () => {
    const db = fakeDb({ data: false });
    const r = await rateLimit({ key: "lead:ip", max: 5, windowSeconds: 60, store: null, db });
    expect(r.backend).toBe("postgres");
    expect(r.ok).toBe(false);
    expect(db.calls).toHaveBeenCalledWith("hit_rate_limit", { p_key: "lead:ip", p_max: 5, p_window_seconds: 60 });
  });

  it("si Upstash falla, cae a Postgres sin romper la petición", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeDb({ data: true });
    const r = await rateLimit({ key: "k", max: 5, windowSeconds: 60, store: brokenStore, db });
    expect(r.backend).toBe("postgres");
    expect(r.ok).toBe(true);
  });

  it("si el RPC devuelve error, permite (fail-open) en vez de tumbar la venta", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeDb({ data: null, error: { message: "función inexistente" } });
    const r = await rateLimit({ key: "k", max: 5, windowSeconds: 60, store: null, db });
    expect(r.ok).toBe(true);
    expect(r.backend).toBe("none");
  });

  it("sin ningún backend permite y lo deja registrado", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await rateLimit({ key: "k", max: 5, windowSeconds: 60, store: null, db: null });
    expect(r).toMatchObject({ ok: true, backend: "none" });
    expect(warn).toHaveBeenCalled();
  });

  it("un RPC que lanza excepción tampoco propaga el error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeDb(() => {
      throw new Error("red caída");
    });
    await expect(rateLimit({ key: "k", max: 5, windowSeconds: 60, store: null, db })).resolves.toMatchObject({ ok: true });
  });
});
