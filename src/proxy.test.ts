/**
 * Pruebas del boundary de autenticación.
 *
 * Este archivo es el que la CVE de Next (GHSA-6gpp-xcg3-4w24) permitía saltarse.
 * No podemos testear el bug del framework desde aquí, pero sí fijar el contrato:
 * sin sesión no se entra a /dashboard, y el destino se preserva para volver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ user: null as unknown }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user }, error: null }) },
  }),
}));

import { proxy, config } from "./proxy";

function req(path: string) {
  return new NextRequest(new Request(`https://www.shaarpass.io${path}`));
}

beforeEach(() => {
  h.user = null;
});

describe("proxy — acceso a /dashboard", () => {
  it("sin sesión redirige a /login", async () => {
    const res = await proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("conserva a dónde quería ir el usuario", async () => {
    const res = await proxy(req("/dashboard/eventos/abc"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("next")).toBe("/dashboard/eventos/abc");
  });

  it("con sesión deja pasar", async () => {
    h.user = { id: "u_1", email: "ana@test.mx" };
    const res = await proxy(req("/dashboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("las subrutas también quedan protegidas", async () => {
    for (const p of ["/dashboard/pagos", "/dashboard/recintos/xyz", "/dashboard/marca"]) {
      const res = await proxy(req(p));
      expect(res.status, `debería redirigir: ${p}`).toBe(307);
    }
  });

  it("el matcher cubre /dashboard y todo lo que cuelga de él", () => {
    expect(config.matcher).toContain("/dashboard/:path*");
  });
});
