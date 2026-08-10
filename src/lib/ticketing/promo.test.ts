import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validatePromo } from "./promo";

// Fake client: solo implementa .rpc(), que es lo único que usa validatePromo.
function fakeDb(row: unknown, error: unknown = null): SupabaseClient {
  return { rpc: async () => ({ data: row, error }) } as unknown as SupabaseClient;
}

describe("validatePromo — cálculo de descuento", () => {
  it("porcentaje: 10% de 10000 = 1000", async () => {
    const db = fakeDb([{ valid: true, discount_type: "percent", discount_value: 10, promo_id: "p1" }]);
    const r = await validatePromo(db, "ev", "DIEZ", 10000);
    expect(r.valid).toBe(true);
    expect(r.discountCents).toBe(1000);
  });

  it("fijo: se topa al subtotal (nunca descuenta de más)", async () => {
    const db = fakeDb([{ valid: true, discount_type: "fixed", discount_value: 5000, promo_id: "p2" }]);
    const r = await validatePromo(db, "ev", "CINCO", 3000);
    expect(r.discountCents).toBe(3000); // no 5000
  });

  it("código vacío → inválido sin tocar la BD", async () => {
    const db = fakeDb(null);
    const r = await validatePromo(db, "ev", "   ", 10000);
    expect(r.valid).toBe(false);
  });

  it("RPC con error → inválido", async () => {
    const db = fakeDb(null, { message: "boom" });
    const r = await validatePromo(db, "ev", "X", 10000);
    expect(r.valid).toBe(false);
  });

  it("descuento porcentual nunca supera el subtotal", async () => {
    const db = fakeDb([{ valid: true, discount_type: "percent", discount_value: 150, promo_id: "p3" }]);
    const r = await validatePromo(db, "ev", "MEGA", 10000);
    expect(r.discountCents).toBeLessThanOrEqual(10000);
  });
});
