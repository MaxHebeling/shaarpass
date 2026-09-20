import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeDb, type FakeDb } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({
  org: null as null | { id: string },
  db: null as unknown as FakeDb,
  tokenResp: {} as Record<string, unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/org", () => ({ getUserOrg: async () => h.org }));

import { GET } from "./route";

const ORG = "33333333-3333-4333-8333-333333333333";

function setup() {
  h.org = { id: ORG };
  h.tokenResp = { access_token: "APP_USR-seller-token", refresh_token: "TG-refresh", user_id: 999888, public_key: "APP_USR-pk", expires_in: 15552000 };
  h.db = createFakeDb({ tables: () => ({ data: null }) });
  global.fetch = vi.fn(async () => ({ json: async () => h.tokenResp })) as unknown as typeof fetch;
}

function get(qs: string) {
  return GET(new Request(`https://www.shaarpass.io/api/mp/connect/callback?${qs}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MP_CLIENT_ID = "1948591475336333";
  process.env.MP_CLIENT_SECRET = "secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://www.shaarpass.io";
  setup();
});

describe("mp/connect/callback", () => {
  it("code + state válidos → guarda tokens en mp_connections y marca la org conectada", async () => {
    const res = await get(`code=AUTHCODE&state=${ORG}`);
    expect(res.headers.get("location")).toContain("mp=conectado");
    const upsert = h.db.queries.find((q) => q.table === "mp_connections" && q.op === "upsert");
    expect(upsert?.payload).toMatchObject({ org_id: ORG, mp_user_id: "999888", access_token: "APP_USR-seller-token", connected: true });
    const orgUpd = h.db.queries.find((q) => q.table === "organizations" && q.op === "update");
    expect(orgUpd?.payload).toEqual({ mp_connected: true });
  });

  it("state que no coincide con la org → error, sin guardar", async () => {
    const res = await get("code=AUTHCODE&state=otra-cosa");
    expect(res.headers.get("location")).toContain("mp_error=state");
    expect(h.db.queries.some((q) => q.table === "mp_connections")).toBe(false);
  });

  it("MP no devuelve access_token → error token", async () => {
    h.tokenResp = { error: "invalid_grant" };
    const res = await get(`code=BAD&state=${ORG}`);
    expect(res.headers.get("location")).toContain("mp_error=token");
  });
});
