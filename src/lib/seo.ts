/** Helpers para SEO programático estilo Eventbrite: /d/{region}--{city}/{categoria} */

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Geo {
  online: boolean;
  region?: string; // slug (ej. "bc")
  city?: string;   // slug (ej. "tijuana")
}

/** "bc--tijuana" → {region:'bc', city:'tijuana'} · "online" → {online:true} */
export function parseGeo(geo: string): Geo {
  if (geo === "online") return { online: true };
  const [region, ...rest] = geo.split("--");
  return { online: false, region, city: rest.join("--") || undefined };
}

/** {region:'bc', city:'tijuana'} → "Tijuana, BC" */
export function geoLabel(geo: Geo): string {
  if (geo.online) return "Online";
  const city = geo.city ? titleCase(geo.city.replace(/-/g, " ")) : "";
  const region = geo.region ? geo.region.toUpperCase() : "";
  return [city, region].filter(Boolean).join(", ");
}

export function buildGeoSlug(region: string | null, city: string | null, isOnline: boolean): string {
  if (isOnline || (!region && !city)) return "online";
  return `${slugify(region || "")}--${slugify(city || "")}`;
}

export const CATEGORIES = [
  { slug: "musica", label: "Música", emoji: "🎵" },
  { slug: "conferencias", label: "Conferencias", emoji: "🎤" },
  { slug: "negocios", label: "Negocios", emoji: "💼" },
  { slug: "comida-y-bebida", label: "Comida y Bebida", emoji: "🍽️" },
  { slug: "arte", label: "Arte y Cultura", emoji: "🎨" },
  { slug: "deportes", label: "Deportes", emoji: "⚽" },
  { slug: "comunidad", label: "Comunidad", emoji: "🤝" },
  { slug: "tecnologia", label: "Tecnología", emoji: "💻" },
] as const;

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? titleCase(slug.replace(/-/g, " "));
}
