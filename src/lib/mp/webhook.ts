import { createHmac, timingSafeEqual } from "node:crypto";

export type MpSignatureVerdict = "ok" | "invalid" | "skip";

/**
 * Verifica la firma HMAC del webhook de Mercado Pago (cabecera `x-signature`).
 *
 * MP firma con un secreto a nivel de APLICACIÓN (no por vendedor), configurable en
 * el panel de MP. El manifiesto es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * firmado con HMAC-SHA256; se compara contra `v1` de la cabecera.
 *
 * Degradación graciosa: si no hay `MERCADOPAGO_WEBHOOK_SECRET` configurado → "skip"
 * (el handler sigue confiando en la re-consulta del pago real como defensa). Si hay
 * secreto pero la firma no cuadra → "invalid" (rechazar 401).
 */
export function verifyMpSignature(opts: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret?: string | undefined;
  now?: number;
}): MpSignatureVerdict {
  const secret = opts.secret ?? process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return "skip";
  if (!opts.signatureHeader || !opts.dataId) return "invalid";

  // x-signature: "ts=1700000000,v1=abcdef..."
  const parts = Object.fromEntries(
    opts.signatureHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return "invalid";

  // MP indica usar el id en minúsculas si es alfanumérico.
  const id = /[a-z]/i.test(opts.dataId) ? opts.dataId.toLowerCase() : opts.dataId;
  const manifest = `id:${id};request-id:${opts.requestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || a.length === 0) return "invalid";
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}
