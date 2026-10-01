import type { ReactElement } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { loadEventForOg, ogTitleDesc, ogDateLabel, ogPlaceLabel } from "@/lib/og/eventOg";

export const runtime = "nodejs";
export const revalidate = 3600; // la imagen se regenera a lo más cada hora

const WIDTH = 1200;
const HEIGHT = 630; // relación 1.91:1
const INK = "#08080c";
const FG = "#f4f4f7";
const MUTED = "#b7b7c7";
const GOLD = "#f5c451";

// Gradiente de marca de ShaarPass (fallback cuando no hay color del organizador).
const BRAND_FROM = "#a855f7";
const BRAND_MID = "#d6219b";
const BRAND_TO = "#f5c451";

const hex = (c: string | null | undefined, fallback: string) =>
  c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : fallback;

// Fuentes locales (TTF estáticas), leídas una sola vez desde el disco (sin red en
// runtime). next.config outputFileTracingIncludes las empaqueta en el serverless.
const FONT_DIR = join(process.cwd(), "src/app/e/[slug]/og/fonts");
let fontCache: { name: string; data: Buffer; weight: 600 | 700; style: "normal" }[] | null = null;
function loadFonts() {
  if (!fontCache) {
    fontCache = [
      { name: "Grotesk", data: readFileSync(join(FONT_DIR, "SpaceGrotesk-700.ttf")), weight: 700, style: "normal" },
      { name: "Inter", data: readFileSync(join(FONT_DIR, "Inter-600.ttf")), weight: 600, style: "normal" },
      { name: "InterB", data: readFileSync(join(FONT_DIR, "Inter-700.ttf")), weight: 700, style: "normal" },
    ];
  }
  return fontCache;
}

function titleSize(title: string): number {
  const n = title.length;
  if (n > 72) return 46;
  if (n > 52) return 56;
  if (n > 34) return 66;
  return 78;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fonts = loadFonts();

  function render(element: ReactElement): ImageResponse {
    return new ImageResponse(element, {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        // Cache en CDN; se revalida en segundo plano. La URL lleva ?v= para bust por contenido.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  }

  const e = await loadEventForOg(slug);

  // NIVEL 4 — fallback genérico premium (evento no encontrado o no publicado).
  if (!e) {
    return render(
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, backgroundColor: INK, backgroundImage: `linear-gradient(135deg, ${BRAND_FROM} 0%, ${BRAND_MID} 50%, ${BRAND_TO} 120%)` }}>
          <div style={{ display: "flex", fontFamily: "Grotesk", fontSize: 84, fontWeight: 700, color: "#08080c", letterSpacing: -2 }}>ShaarPass</div>
          <div style={{ display: "flex", marginTop: 12, fontFamily: "Inter", fontSize: 34, color: "rgba(8,8,12,0.75)" }}>Vende boletos con la comisión más baja y transparente.</div>
        </div>,
    );
  }

  const { title: ogTitle } = ogTitleDesc(e);
  void ogTitle;
  const dateLabel = ogDateLabel(e);
  const placeLabel = ogPlaceLabel(e);
  const accent = hex(e.brandColor, BRAND_MID);
  const hasCover = Boolean(e.coverImage);
  const showLogo = Boolean(e.orgLogo);
  const tSize = titleSize(e.title);

  return render(
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: INK, fontFamily: "Inter" }}>
        {/* Fondo: portada (NIVEL 1/2) o gradiente de marca (NIVEL 3) */}
        {hasCover ? (
          <img src={e.coverImage as string} width={WIDTH} height={HEIGHT} style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, display: "flex", backgroundImage: `linear-gradient(135deg, ${INK} 0%, ${accent} 160%)` }} />
        )}
        {/* Scrim para legibilidad (más oscuro abajo e izquierda) */}
        <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: HEIGHT, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(8,8,12,0.15) 0%, rgba(8,8,12,0.55) 55%, rgba(8,8,12,0.92) 100%)" }} />
        {/* Línea de acento de marca (arriba) */}
        <div style={{ position: "absolute", top: 0, left: 0, width: WIDTH, height: 8, display: "flex", backgroundImage: `linear-gradient(90deg, ${BRAND_FROM}, ${BRAND_MID}, ${BRAND_TO})` }} />

        {/* Barra superior: logo del organizador o wordmark ShaarPass (zona segura) */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "56px 64px 0" }}>
          {showLogo ? (
            <div style={{ display: "flex", alignItems: "center", padding: "12px 18px", borderRadius: 16, backgroundColor: "rgba(8,8,12,0.55)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <img src={e.orgLogo as string} height={56} style={{ height: 56, maxWidth: 260, objectFit: "contain" }} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", fontFamily: "Grotesk", fontSize: 34, fontWeight: 700, color: FG, letterSpacing: -0.5 }}>ShaarPass</div>
          )}
        </div>

        {/* Bloque de contenido (abajo-izquierda) */}
        <div style={{ position: "relative", marginTop: "auto", display: "flex", flexDirection: "column", padding: "0 64px 60px", maxWidth: 1000 }}>
          {e.category ? (
            <div style={{ display: "flex", alignSelf: "flex-start", marginBottom: 18, padding: "6px 14px", borderRadius: 999, backgroundColor: "rgba(245,196,81,0.16)", color: GOLD, fontFamily: "InterB", fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
              {e.category}
            </div>
          ) : null}

          <div style={{ display: "flex", fontFamily: "Grotesk", fontWeight: 700, fontSize: tSize, lineHeight: 1.04, color: FG, letterSpacing: -1 }}>
            {e.title.length > 96 ? e.title.slice(0, 95) + "…" : e.title}
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: 24, gap: 16 }}>
            <div style={{ display: "flex", width: 14, height: 14, borderRadius: 999, backgroundImage: `linear-gradient(135deg, ${BRAND_MID}, ${BRAND_TO})` }} />
            <div style={{ display: "flex", fontFamily: "Inter", fontSize: 32, fontWeight: 600, color: FG }}>
              {[dateLabel, placeLabel].filter(Boolean).join("   ·   ")}
            </div>
          </div>

          {e.orgName && !e.whiteLabel ? (
            <div style={{ display: "flex", marginTop: 14, fontFamily: "Inter", fontSize: 26, color: MUTED }}>por {e.orgName}</div>
          ) : null}
        </div>
      </div>,
  );
}
