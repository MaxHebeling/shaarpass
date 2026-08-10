import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWithTimeout } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

/**
 * Analiza la foto del recinto con Claude (vision) + las medidas reales y devuelve
 * sugerencias estructuradas para alimentar el generador geométrico.
 * Degrada con gracia si no hay ANTHROPIC_API_KEY.
 */
export async function POST(req: Request) {
  // Auth: solo organizadores logueados.
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key", message: "Configura ANTHROPIC_API_KEY para activar el análisis de imagen con IA." });

  const body = await req.json().catch(() => ({}));
  const { imageUrl, widthM, lengthM, totalChairs, unit } = body as { imageUrl?: string; widthM?: number; lengthM?: number; totalChairs?: number; unit?: string };
  if (!imageUrl) return NextResponse.json({ error: "falta imageUrl" }, { status: 400 });

  // Descarga la imagen y la pasa como base64 (Claude vision).
  let dataB64 = "", mediaType = "image/jpeg";
  try {
    const r = await fetchWithTimeout(imageUrl, {}, 20_000);
    if (!r.ok) throw new Error("no se pudo descargar la imagen");
    mediaType = r.headers.get("content-type") || "image/jpeg";
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) mediaType = "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_500_000) return NextResponse.json({ error: "imagen muy grande (máx ~4.5MB)" }, { status: 413 });
    dataB64 = buf.toString("base64");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const prompt = `Eres un planificador profesional de recintos para eventos. Analiza esta foto de un recinto/salón/auditorio.
Medidas reales que dio el organizador: ancho ${widthM ?? "?"} ${unit ?? "m"}, largo ${lengthM ?? "?"} ${unit ?? "m"}. Sillas deseadas: ${totalChairs ?? "?"}.
Devuelve ÚNICAMENTE un objeto JSON válido (sin texto adicional, sin markdown) con esta forma exacta:
{
  "shapeNotes": "string — forma general y observaciones del espacio",
  "stageSide": "top|bottom|left|right — dónde conviene el escenario según la foto",
  "blockedAreas": ["columnas, pilares o zonas bloqueadas visibles"],
  "entrancesNotes": "string — dónde se ven accesos/salidas",
  "suggestedPerRow": number,
  "centralAisle": boolean,
  "lateralAisles": boolean,
  "estimatedCapacity": number,
  "zones": ["zonas especiales recomendadas: VIP, registro, baños, control sonido, staff"],
  "recommendations": ["3-6 recomendaciones de seguridad, visibilidad, flujo y aprovechamiento"]
}
Sé realista: usa las medidas dadas para la capacidad; si la foto es ambigua, dilo en shapeNotes.`;

  try {
    const resp = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: dataB64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return NextResponse.json({ error: `IA: ${resp.status}`, detail: t.slice(0, 300) }, { status: 502 });
    }
    const data = await resp.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "respuesta de IA no parseable" }, { status: 502 });
    const analysis = JSON.parse(match[0]);
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
