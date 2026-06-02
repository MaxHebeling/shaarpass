import Link from "next/link";
import { Calendar, MapPin } from "lucide-react";
import { money } from "@/lib/money";

export interface EventCardData {
  slug: string;
  title: string;
  cover_image: string | null;
  category: string | null;
  city: string | null;
  region: string | null;
  is_online: boolean;
  starts_at: string;
  currency: string;
  min_price_cents: number | null;
}

export function EventCard({ e }: { e: EventCardData }) {
  const date = new Date(e.starts_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  const place = e.is_online ? "Online" : [e.city, e.region].filter(Boolean).join(", ");

  return (
    <Link
      href={`/e/${e.slug}`}
      className="group glass overflow-hidden rounded-3xl transition hover:border-white/20 hover:-translate-y-1"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
        {e.cover_image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={e.cover_image} alt={e.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        )}
        {e.category && (
          <span className="glass absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium text-gold">
            {e.category}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-lg font-semibold leading-tight line-clamp-2">{e.title}</h3>
        <div className="mt-2 space-y-1 text-sm text-muted">
          <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {date}</div>
          <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {place}</div>
        </div>
        {e.min_price_cents != null && (
          <div className="mt-3 font-display font-bold text-gold">
            {e.min_price_cents === 0 ? "Gratis" : `Desde ${money(e.min_price_cents, e.currency)}`}
          </div>
        )}
      </div>
    </Link>
  );
}
