/**
 * Campos de registro personalizados por evento — lógica PURA (sin efectos),
 * compartida por servidor (validación), cliente (render) y editor. Probada en tests.
 */

export type CustomFieldType = "text" | "tel" | "email" | "select";
export interface CustomField {
  key: string;               // id estable del campo
  label: string;             // etiqueta visible
  type: CustomFieldType;
  required: boolean;
  options?: string[];        // solo para type 'select'
}

const TYPES: CustomFieldType[] = ["text", "tel", "email", "select"];
const MAX_FIELDS = 20;
const MAX_VALUE = 500;

/** Sanea/normaliza una definición cruda (de la BD o del editor). Descarta basura. */
export function parseCustomFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomField[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const rec = f as Record<string, unknown>;
    const key = String(rec.key ?? "").trim().slice(0, 40);
    const label = String(rec.label ?? "").trim().slice(0, 80);
    if (!key || !label || seen.has(key)) continue;
    const type: CustomFieldType = TYPES.includes(rec.type as CustomFieldType) ? (rec.type as CustomFieldType) : "text";
    const required = rec.required === true;
    let options: string[] | undefined;
    if (type === "select") {
      options = Array.isArray(rec.options)
        ? rec.options.map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 50)
        : [];
    }
    seen.add(key);
    out.push({ key, label, type, required, ...(options ? { options } : {}) });
    if (out.length >= MAX_FIELDS) break;
  }
  return out;
}

/** Valida las respuestas del comprador contra la definición. Devuelve solo los
 *  valores de campos definidos (ignora claves extra). */
export function validateCustomData(
  fields: CustomField[],
  data: Record<string, unknown> | undefined | null,
): { ok: true; clean: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {};
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  for (const f of fields) {
    const v = d[f.key] == null ? "" : String(d[f.key]).trim().slice(0, MAX_VALUE);
    if (f.required && !v) return { ok: false, error: `Falta un dato requerido: ${f.label}` };
    if (v && f.type === "select" && f.options && f.options.length > 0 && !f.options.includes(v)) {
      return { ok: false, error: `Valor no válido en: ${f.label}` };
    }
    if (v) clean[f.key] = v;
  }
  return { ok: true, clean };
}
