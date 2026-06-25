import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Gemini "nano-banana" (image generation). Modelo configurable.
const MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";

/** Genera un render fotorrealista (decorativo) del espacio con Gemini. Degrada sin key. */
export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autenticado" }, { status: 401 });

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return NextResponse.json({ ok: false, reason: "no_key", message: "Configura GEMINI_API_KEY para generar renders fotorrealistas." });

  const b = await req.json().catch(() => ({}));
  const { eventType, widthM, lengthM, zones, planImage } = b as { eventType?: string; widthM?: number; lengthM?: number; zones?: string[]; planImage?: string };

  const zonesTxt = (zones || []).slice(0, 12).join(", ");
  const prompt = `Render arquitectónico FOTORREALISTA, calidad Unreal Engine 5 / Enscape, de un espacio de evento tipo "${eventType || "auditorio"}" de aproximadamente ${widthM ?? 20}m x ${lengthM ?? 30}m. Vista cenital (planta, cámara 90° desde arriba). Incluye: ${zonesTxt || "escenario al frente, filas de sillas, pasillos, accesos y salidas"}. Iluminación realista, materiales PBR, sombras suaves, proporciones arquitectónicas correctas, piso y muros realistas. Sin texto ni marcas de agua. Estilo plano de evento profesional.`;

  // Si llega el plano 2D, se usa como guía de composición (image-to-image).
  const parts: unknown[] = [{ text: prompt }];
  if (planImage && planImage.startsWith("data:image")) {
    const [meta, data] = planImage.split(",");
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/png";
    parts.push({ inline_data: { mime_type: mime, data } });
  }

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });
    if (!resp.ok) return NextResponse.json({ error: `Render IA: ${resp.status}`, detail: (await resp.text()).slice(0, 300) }, { status: 502 });
    const data = await resp.json();
    const out = data?.candidates?.[0]?.content?.parts ?? [];
    const img = out.find((p: { inline_data?: { data: string; mime_type: string }; inlineData?: { data: string; mimeType: string } }) => p.inline_data || p.inlineData);
    const inline = img?.inline_data || img?.inlineData;
    if (!inline?.data) return NextResponse.json({ error: "La IA no devolvió imagen" }, { status: 502 });
    const mime = inline.mime_type || inline.mimeType || "image/png";
    return NextResponse.json({ ok: true, image: `data:${mime};base64,${inline.data}` });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
