import { describe, it, expect } from "vitest";
import { parseCustomFields, validateCustomData } from "./customFields";

describe("parseCustomFields", () => {
  it("normaliza definiciones válidas y descarta basura", () => {
    const out = parseCustomFields([
      { key: "empresa", label: "Empresa", type: "text", required: true },
      { key: "puesto", label: "Puesto", type: "select", required: false, options: ["Director", "Gerente", ""] },
      { key: "", label: "sin key" },        // descartado
      { key: "dup", label: "A" }, { key: "dup", label: "B" }, // dedup
      "no-objeto",                           // descartado
    ]);
    expect(out).toEqual([
      { key: "empresa", label: "Empresa", type: "text", required: true },
      { key: "puesto", label: "Puesto", type: "select", required: false, options: ["Director", "Gerente"] },
      { key: "dup", label: "A", type: "text", required: false },
    ]);
  });

  it("tipo inválido → text; no-array → []", () => {
    expect(parseCustomFields([{ key: "a", label: "A", type: "raro" }])[0].type).toBe("text");
    expect(parseCustomFields(null)).toEqual([]);
    expect(parseCustomFields(undefined)).toEqual([]);
  });
});

describe("validateCustomData", () => {
  const fields = parseCustomFields([
    { key: "empresa", label: "Empresa", type: "text", required: true },
    { key: "puesto", label: "Puesto", type: "select", required: false, options: ["Director", "Gerente"] },
  ]);

  it("requerido faltante → error", () => {
    const r = validateCustomData(fields, { puesto: "Director" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Empresa");
  });

  it("select fuera de opciones → error", () => {
    const r = validateCustomData(fields, { empresa: "ACME", puesto: "Becario" });
    expect(r.ok).toBe(false);
  });

  it("válido → limpia y conserva solo campos definidos", () => {
    const r = validateCustomData(fields, { empresa: "  ACME  ", puesto: "Gerente", basura: "x" });
    expect(r).toEqual({ ok: true, clean: { empresa: "ACME", puesto: "Gerente" } });
  });

  it("sin campos definidos → siempre ok, clean vacío", () => {
    expect(validateCustomData([], { lo: "que sea" })).toEqual({ ok: true, clean: {} });
  });
});
