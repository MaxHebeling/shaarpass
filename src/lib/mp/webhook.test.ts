import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMpSignature } from "./webhook";

const SECRET = "test_secret_abc";
function sign(id: string, requestId: string, ts: string): string {
  const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("verifyMpSignature", () => {
  it("sin secreto configurado → skip (confía en la re-consulta del pago)", () => {
    expect(verifyMpSignature({ signatureHeader: "ts=1,v1=x", requestId: "r", dataId: "123", secret: undefined })).toBe("skip");
  });

  it("firma correcta → ok", () => {
    const header = sign("123456", "req-1", "1700000000");
    expect(verifyMpSignature({ signatureHeader: header, requestId: "req-1", dataId: "123456", secret: SECRET })).toBe("ok");
  });

  it("firma manipulada → invalid", () => {
    const header = sign("123456", "req-1", "1700000000");
    expect(verifyMpSignature({ signatureHeader: header, requestId: "req-1", dataId: "999999", secret: SECRET })).toBe("invalid");
  });

  it("id alfanumérico se normaliza a minúsculas (como indica MP)", () => {
    const header = sign("abc123", "req-1", "1700000000");
    expect(verifyMpSignature({ signatureHeader: header, requestId: "req-1", dataId: "ABC123", secret: SECRET })).toBe("ok");
  });

  it("cabecera ausente con secreto → invalid", () => {
    expect(verifyMpSignature({ signatureHeader: null, requestId: "r", dataId: "123", secret: SECRET })).toBe("invalid");
  });

  it("cabecera sin v1/ts → invalid", () => {
    expect(verifyMpSignature({ signatureHeader: "foo=bar", requestId: "r", dataId: "123", secret: SECRET })).toBe("invalid");
  });
});
