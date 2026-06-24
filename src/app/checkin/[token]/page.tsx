import { createPublicClient } from "@/lib/supabase/public";
import { StaffCheckinApp } from "@/components/checkin/StaffCheckinApp";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StaffCheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createPublicClient();
  const { data } = await db.rpc("staff_session", { p_token: token });
  const s = Array.isArray(data) ? data[0] : data;

  if (!s || s.revoked || s.expired) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div className="glass max-w-sm rounded-3xl p-8">
          <AlertTriangle className="mx-auto h-10 w-10 text-gold" />
          <h1 className="mt-4 font-display text-xl font-bold">Enlace no válido</h1>
          <p className="mt-2 text-sm text-muted">
            {s?.revoked ? "Este acceso de escáner fue revocado." : s?.expired ? "Este enlace de escáner expiró." : "El enlace no existe o ya no está disponible."}
          </p>
          <p className="mt-3 text-xs text-muted">Pide al organizador un enlace nuevo.</p>
        </div>
      </main>
    );
  }

  return (
    <StaffCheckinApp
      token={token}
      staffName={s.staff_name}
      gate={s.gate}
      event={{
        title: s.event_title,
        coverImage: s.cover_image,
        startsAt: s.starts_at,
        timezone: s.timezone,
        city: s.city,
        region: s.region,
        isOnline: s.is_online,
      }}
    />
  );
}
