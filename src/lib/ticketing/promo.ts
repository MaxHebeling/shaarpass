import type { SupabaseClient } from "@supabase/supabase-js";

export interface PromoResult {
  valid: boolean;
  message?: string;
  promoId?: string;
  discountCents?: number;
  discountType?: "percent" | "fixed";
  discountValue?: number;
}

/**
 * Valida un código promocional vía RPC SECURITY DEFINER `validate_promo_code`
 * (no expone la tabla; funciona con cualquier client, incluido el público).
 * Calcula el descuento sobre el subtotal.
 */
export async function validatePromo(
  db: SupabaseClient,
  eventId: string,
  code: string,
  subtotalCents: number
): Promise<PromoResult> {
  const clean = code.trim();
  if (!clean) return { valid: false, message: "Código vacío" };

  const { data, error } = await db.rpc("validate_promo_code", { p_event: eventId, p_code: clean });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || !row.valid) {
    return { valid: false, message: row?.reason ?? "Código no válido" };
  }

  const discountCents =
    row.discount_type === "percent"
      ? Math.round((subtotalCents * row.discount_value) / 100)
      : Math.min(row.discount_value, subtotalCents);

  return {
    valid: true,
    promoId: row.promo_id,
    discountCents: Math.min(discountCents, subtotalCents),
    discountType: row.discount_type,
    discountValue: row.discount_value,
  };
}
