import { describe, it, expect } from "vitest";
import { validateEnv } from "./env";

const full = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  NEXT_PUBLIC_APP_URL: "https://shaarpass.io",
  STRIPE_SECRET_KEY: "sk_test",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test",
  STRIPE_WEBHOOK_SECRET: "whsec",
  CRON_SECRET: "cron",
  RESEND_API_KEY: "re_x",
  EMAIL_FROM: "no-reply@shaarpass.io",
  RESEND_WEBHOOK_SECRET: "svix",
};

describe("validateEnv", () => {
  it("un entorno completo pasa", () => {
    expect(validateEnv(full)).toEqual({ ok: true, missing: [], invalid: [] });
  });

  it("reporta faltantes por nombre (sin exponer valores)", () => {
    const { SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, ...partial } = full;
    const r = validateEnv(partial);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(r.missing).toContain("STRIPE_SECRET_KEY");
  });

  it("una URL mal formada cuenta como inválida, no faltante", () => {
    const r = validateEnv({ ...full, NEXT_PUBLIC_APP_URL: "no-es-url" });
    expect(r.ok).toBe(false);
    expect(r.invalid).toContain("NEXT_PUBLIC_APP_URL");
    expect(r.missing).not.toContain("NEXT_PUBLIC_APP_URL");
  });
});
