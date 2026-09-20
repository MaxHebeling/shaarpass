import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ org: null as null | { id: string } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/org", () => ({ getUserOrg: async () => h.org }));

import { GET } from "./route";

const ORG = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MP_CLIENT_ID = "1948591475336333";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.shaarpass.io";
  h.org = { id: ORG };
});

describe("mp/connect", () => {
  it("con organización → redirige al OAuth de Mercado Pago con los parámetros correctos", async () => {
    const res = await GET();
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("auth.mercadopago.com.mx/authorization");
    expect(loc).toContain("client_id=1948591475336333");
    expect(loc).toContain("response_type=code");
    expect(loc).toContain(`state=${ORG}`);
    expect(loc).toContain(encodeURIComponent("https://www.shaarpass.io/api/mp/connect/callback"));
  });

  it("sin organización → manda a login", async () => {
    h.org = null;
    const res = await GET();
    expect(res.headers.get("location")).toContain("/login");
  });
});
