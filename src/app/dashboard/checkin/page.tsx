import { createClient } from "@/lib/supabase/server";
import { CheckinScanner, type ScannerEvent } from "@/components/dashboard/CheckinScanner";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: memberships } = await db.from("org_members").select("org_id").eq("user_id", user?.id ?? "");
  const orgIds = (memberships ?? []).map((m) => m.org_id);

  let events: ScannerEvent[] = [];
  if (orgIds.length) {
    const { data: evs } = await db
      .from("events")
      .select("id, title, timezone, status, starts_at, event_days(id, day_date, starts_at)")
      .in("org_id", orgIds)
      .neq("status", "draft")
      .order("starts_at", { ascending: false })
      .limit(60);

    events = (evs ?? [])
      .map((e) => {
        const tz = (e.timezone as string) || "America/Mexico_City";
        const days = ((e.event_days as { id: string; day_date: string; starts_at: string }[]) ?? [])
          .slice()
          .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
        return {
          id: e.id as string,
          title: e.title as string,
          timezone: tz,
          days: days.map((d) => ({
            id: d.id,
            label: (() => { try { return new Date(d.starts_at).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: tz }); } catch { return d.day_date; } })(),
          })),
        };
      })
      // Solo los eventos de varios días necesitan selector (los de 1 día usan auto).
      .filter((e) => e.days.length > 1);
  }

  return <CheckinScanner events={events} />;
}
