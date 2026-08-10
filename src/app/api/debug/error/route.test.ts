/**
 * La ruta de prueba de observabilidad es, por definición, una ruta que rompe
 * cosas a propósito. Lo que se protege aquí es que NO sea alcanzable sin el
 * secreto: si esto se abre, cualquiera puede generar 500s y ruido en Sentry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  captureError: vi.fn((_err: unknown, _context?: Record<string, unknown>) => "e_test_123"),
}));
vi.mock("@/lib/log", () => ({ captureError: h.captureError, log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from "./route";

const SECRET = "secreto-de-prueba";
const prev = process.env.CRON_SECRET;

function get(opts: { auth?: string; mode?: string } = {}) {
  const url = `https://www.shaarpass.io/api/debug/error${opts.mode ? `?mode=${opts.mode}` : ""}`;
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  return GET(new Request(url, { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
  if (prev === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prev;
});

describe("acceso", () => {
  it("sin cabecera → 404 y no genera ningún evento", async () => {
    const res = await get();
    expect(res.status).toBe(404);
    expect(h.captureError).not.toHaveBeenCalled();
  });

  it("con secreto equivocado → 404", async () => {
    expect((await get({ auth: "Bearer nope" })).status).toBe(404);
    expect(h.captureError).not.toHaveBeenCalled();
  });

  it("no filtra que la ruta existe (404, nunca 401/403)", async () => {
    const res = await get({ auth: "Bearer nope" });
    expect([401, 403]).not.toContain(res.status);
  });

  it("si CRON_SECRET no está configurado, la ruta no existe ni con cabecera", async () => {
    delete process.env.CRON_SECRET;
    expect((await get({ auth: "Bearer " })).status).toBe(404);
    expect(h.captureError).not.toHaveBeenCalled();
  });
});

describe("modos", () => {
  it("capture: devuelve el errorId para cruzarlo con Sentry", async () => {
    const res = await get({ auth: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, errorId: "e_test_123" });
    expect(h.captureError).toHaveBeenCalledTimes(1);
    expect(h.captureError.mock.calls[0][1]).toMatchObject({ source: "debug/error", mode: "capture" });
  });

  it("throw: lanza de verdad, para ejercitar onRequestError", async () => {
    await expect(get({ auth: `Bearer ${SECRET}`, mode: "throw" })).rejects.toThrow(/observabilidad/);
    // No lo captura la ruta: eso es trabajo de instrumentation.ts.
    expect(h.captureError).not.toHaveBeenCalled();
  });

  it("informa si Sentry está configurado, sin exponer el DSN", async () => {
    const res = await get({ auth: `Bearer ${SECRET}` });
    const body = await res.json();
    expect(typeof body.sentry).toBe("boolean");
    expect(JSON.stringify(body)).not.toContain("ingest");
  });
});
