import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWithTimeout } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

// Replicate. Modelo configurable (default flux-schnell: rápido y económico).
const MODEL = process.env.REPLICATE_MODEL ?? "black-forest-labs/flux-schnell";

/** Genera un render fotorrealista (decorativo) del espacio con Replicate. Degrada sin token. */
export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return NextResponse.json({ ok: false, reason: "no_key", message: "Configura REPLICATE_API_TOKEN para generar renders fotorrealistas." });

  const b = await req.json().catch(() => ({}));
  const { prompt: rawPrompt, eventType, widthM, lengthM, zones, aspectRatio } = b as { prompt?: string; eventType?: string; widthM?: number; lengthM?: number; zones?: string[]; aspectRatio?: string };
  const zonesTxt = (zones || []).slice(0, 12).join(", ");
  // Si llega un prompt (los datos del usuario), se usa tal cual + sufijo de calidad.
  const prompt = rawPrompt && rawPrompt.trim()
    ? `${rawPrompt.trim()}. Photorealistic architectural render, realistic lighting, PBR materials, soft shadows, correct proportions, Unreal Engine 5 / Enscape quality. No text, no watermark.`
    : `Photorealistic architectural render, top-down aerial floor plan view (camera straight above, 90 degrees), of an event space type "${eventType || "auditorium"}" approximately ${widthM ?? 20}m by ${lengthM ?? 30}m. Includes: ${zonesTxt || "stage at front, rows of chairs, aisles, entrances and exits"}. Realistic lighting, PBR materials, soft shadows, correct architectural proportions, realistic floor and walls. Unreal Engine 5 / Enscape quality. No text, no watermark.`;
  const ar = ["1:1", "4:3", "16:9", "3:2", "9:16"].includes(aspectRatio || "") ? aspectRatio : "4:3";

  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "wait" };
  try {
    const start = await fetchWithTimeout(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: "POST", headers,
      body: JSON.stringify({ input: { prompt, aspect_ratio: ar, num_outputs: 1, output_format: "webp", output_quality: 90 } }),
    });
    if (!start.ok) return NextResponse.json({ error: `Render IA: ${start.status}`, detail: (await start.text()).slice(0, 300) }, { status: 502 });
    let pred = await start.json();

    // Si aún no terminó (Prefer: wait expiró), sondea el resultado.
    for (let i = 0; i < 10 && (pred.status === "starting" || pred.status === "processing"); i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetchWithTimeout(pred.urls?.get, { headers: { Authorization: `Bearer ${token}` } }, 20_000);
      pred = await poll.json();
    }
    if (pred.status === "failed" || pred.status === "canceled") return NextResponse.json({ error: pred.error || "La IA falló al generar" }, { status: 502 });

    const out = pred.output;
    const url = Array.isArray(out) ? out[0] : typeof out === "string" ? out : null;
    if (!url) return NextResponse.json({ error: "La IA no devolvió imagen" }, { status: 502 });
    return NextResponse.json({ ok: true, image: url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
