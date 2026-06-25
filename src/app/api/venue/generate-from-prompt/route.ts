import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/**
 * Genera (o edita) un espacio completo a partir de lenguaje natural con Claude.
 * mode "generate": diseño completo. mode "edit": zonas a AGREGAR según la instrucción.
 */
export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key", message: "Configura ANTHROPIC_API_KEY para el Generador Inteligente de Espacios." });

  const b = await req.json().catch(() => ({}));
  const mode: "generate" | "edit" = b.mode === "edit" ? "edit" : "generate";
  const W = Math.max(4, Number(b.widthM) || 20), L = Math.max(4, Number(b.lengthM) || 30);
  const prompt: string = (b.prompt || "").toString().slice(0, 1500);
  if (!prompt.trim()) return NextResponse.json({ error: "falta prompt" }, { status: 400 });

  const schema = `Cada zona: {"name": string, "kind": "seated"|"ga"|"table", "color": "#hex", "x": number, "y": number, "w": number, "h": number} en METROS dentro de un piso de ${W}m (x: 0..${W}) por ${L}m (y: 0..${L}). y=0 es el frente (escenario). NO te salgas del piso. Evita solapamientos. Usa "seated" SOLO para bloques de sillas (se llenarán de asientos automáticamente, separación ~0.55m silla y ~0.9m fila). Usa "ga" para escenario, accesos, salidas, baños, VIP, cafetería, librería, registro, prensa, cabinas, backstage, networking, primeros auxilios, etc. Usa "table" para zonas de mesas/banquete. Colores sugeridos: escenario #d6219b, sillas #7c3aed, accesos #10b981, salidas #ef4444, baños #38bdf8, VIP #eab308, técnico #a855f7.`;

  const sys = "Eres un arquitecto experto en diseño de espacios para eventos: flujo de personas, visibilidad, evacuación, normativas y capacidad. Diseñas distribuciones reales, sin solapamientos, respetando medidas. Respondes SOLO con JSON válido, sin markdown ni texto extra.";

  const userMsg = mode === "generate"
    ? `Diseña el espacio completo para esta petición:\n"${prompt}"\nPiso disponible: ${W}m × ${L}m.\nDevuelve SOLO este JSON: {"summary": "string breve", "zones": [zona, ...]}.\n${schema}\nIncluye SIEMPRE: escenario, bloque(s) de sillas, accesos, salidas de emergencia y baños, además de lo que pida la petición.`
    : `Espacio actual (${W}m × ${L}m) con estas zonas: ${(b.currentZones || []).map((z: { name: string }) => z.name).join(", ") || "ninguna"}.\nInstrucción del usuario: "${prompt}"\nDevuelve SOLO este JSON con las zonas a AGREGAR (no repitas las existentes): {"summary": "qué hiciste", "zonesToAdd": [zona, ...]}.\n${schema}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2200, system: sys, messages: [{ role: "user", content: userMsg }] }),
    });
    if (!resp.ok) return NextResponse.json({ error: `IA: ${resp.status}`, detail: (await resp.text()).slice(0, 300) }, { status: 502 });
    const data = await resp.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "respuesta IA no parseable" }, { status: 502 });
    const parsed = JSON.parse(match[0]);
    return NextResponse.json({ ok: true, ...parsed, widthM: W, lengthM: L });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
