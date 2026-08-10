/**
 * `/api/health` es lo que miran el uptime monitor y quien acaba de desplegar.
 *
 * Lo que se protege aquí: que responda sin tocar dependencias (si consultara la
 * base de datos, una caída de Supabase lo tumbaría y perderíamos la señal de
 * liveness), y que `deployment` permita distinguir dos deployments del MISMO
 * commit — el caso de "cambié una variable de entorno y redesplegué".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

const original = { ...process.env };

beforeEach(() => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_ENV;
});

afterEach(() => {
  process.env = { ...original };
});

describe("/api/health", () => {
  it("responde 200 siempre, sin depender de nada externo", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, service: "shaarpass" });
  });

  it("en local degrada a valores legibles en vez de undefined", async () => {
    await expect((await GET()).json()).resolves.toMatchObject({
      version: "dev",
      deployment: "local",
      env: "development",
    });
  });

  it("acorta el commit a 7 caracteres", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "bd53ed7f1c2a3b4d5e6f7a8b9c0d1e2f3a4b5c6d";
    await expect((await GET()).json()).resolves.toMatchObject({ version: "bd53ed7" });
  });

  it("distingue dos deployments del MISMO commit", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "bd53ed7aaaa";
    process.env.VERCEL_URL = "shaarpass-antiguo.vercel.app";
    const antes = await (await GET()).json();

    process.env.VERCEL_URL = "shaarpass-nuevo.vercel.app";
    const despues = await (await GET()).json();

    expect(despues.version).toBe(antes.version); // mismo commit
    expect(despues.deployment).not.toBe(antes.deployment); // distinto deployment
  });

  it("no filtra secretos", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "no-debe-salir";
    process.env.STRIPE_SECRET_KEY = "tampoco";
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toContain("no-debe-salir");
    expect(body).not.toContain("tampoco");
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(["deployment", "env", "ok", "service", "ts", "version"]);
  });
});
