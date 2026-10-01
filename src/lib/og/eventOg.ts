import { createPublicClient } from "@/lib/supabase/public";
import { formatDayRange } from "@/lib/datetime";

/** Datos normalizados de un evento para generar su Open Graph (metadata + imagen). */
export interface OgEvent {
  slug: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  city: string | null;
  region: string | null;
  venueName: string | null;
  category: string | null;
  orgName: string | null;
  orgLogo: string | null;
  brandColor: string | null;
  whiteLabel: boolean;
  isOnline: boolean;
  status: string;
  firstDay: string | null; // "YYYY-MM-DD"
  lastDay: string | null;
}

/**
 * Carga un evento PUBLICADO por slug para su OG. Multi-tenant seguro: lee el evento
 * por slug+published y SOLO sus propios org/venue vía FK (sin fuga entre organizaciones).
 */
export async function loadEventForOg(slug: string): Promise<OgEvent | null> {
  const db = createPublicClient();
  const { data: e } = await db
    .from("events")
    .select("id, slug, title, description, cover_image, city, region, category, is_online, status, organizations(name, logo_url, brand_color, white_label), venues(name)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{
      id: string; slug: string; title: string; description: string | null; cover_image: string | null;
      city: string | null; region: string | null; category: string | null; is_online: boolean; status: string;
      organizations: { name: string; logo_url: string | null; brand_color: string | null; white_label: boolean } | { name: string; logo_url: string | null; brand_color: string | null; white_label: boolean }[] | null;
      venues: { name: string | null } | { name: string | null }[] | null;
    }>();
  if (!e) return null;

  const { data: days } = await db.from("event_days").select("day_date").eq("event_id", e.id).order("day_date");
  const dates = (days ?? []).map((d) => d.day_date as string).sort();
  const org = Array.isArray(e.organizations) ? e.organizations[0] : e.organizations;
  const venue = Array.isArray(e.venues) ? e.venues[0] : e.venues;

  return {
    slug: e.slug,
    title: e.title,
    description: e.description,
    coverImage: e.cover_image,
    city: e.city,
    region: e.region,
    venueName: venue?.name ?? null,
    category: e.category,
    orgName: org?.name ?? null,
    orgLogo: org?.logo_url ?? null,
    brandColor: org?.brand_color ?? null,
    whiteLabel: org?.white_label ?? false,
    isOnline: e.is_online,
    status: e.status,
    firstDay: dates[0] ?? null,
    lastDay: dates[dates.length - 1] ?? null,
  };
}

/** Título y descripción OG (mismos criterios que la metadata de la página). */
export function ogTitleDesc(e: Pick<OgEvent, "title" | "description" | "city" | "region" | "orgName" | "whiteLabel">): {
  title: string;
  description: string;
} {
  const place = [e.city, e.region].filter(Boolean).join(", ");
  const brand = e.whiteLabel ? e.orgName ?? "" : "ShaarPass";
  const title = `${e.title}${place ? ` · ${place}` : ""}${brand ? ` | ${brand}` : ""}`.slice(0, 110);
  const clean = e.description?.replace(/\s+/g, " ").trim();
  const description = (clean && clean.length > 0
    ? clean
    : `Boletos para ${e.title}${place ? ` en ${place}` : ""}. Asegura tu lugar — pago seguro y QR al instante con ShaarPass.`
  ).slice(0, 160);
  return { title, description };
}

/** Etiqueta de fecha (rango) para el OG. */
export function ogDateLabel(e: Pick<OgEvent, "firstDay" | "lastDay">): string {
  return e.firstDay ? formatDayRange(e.firstDay, e.lastDay ?? e.firstDay) : "";
}

/** Dónde se realiza (venue · ciudad, o "Evento en línea"). */
export function ogPlaceLabel(e: Pick<OgEvent, "isOnline" | "venueName" | "city" | "region">): string {
  if (e.isOnline) return "Evento en línea";
  return [e.venueName, e.city, e.region].filter(Boolean).join(" · ");
}

/**
 * Versión de la imagen OG (cache-busting): hash corto de los campos que afectan el
 * render. Si cambia el título/portada/fecha/marca/estado, cambia la URL → las redes
 * sociales dejan de mostrar la versión vieja.
 */
export function ogVersion(e: OgEvent): string {
  const key = [e.title, e.coverImage ?? "", e.firstDay ?? "", e.lastDay ?? "", e.orgLogo ?? "", e.brandColor ?? "", e.status, e.venueName ?? "", e.city ?? "", e.isOnline ? "1" : "0"].join("|");
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
