import { Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BrandingManager } from "@/components/dashboard/BrandingManager";

export const dynamic = "force-dynamic";

export default async function MarcaPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const { data: m } = await db.from("org_members").select("org_id").eq("user_id", user?.id ?? "").limit(1).maybeSingle();
  const orgId = m?.org_id as string | undefined;

  let logo: string | null = null, color: string | null = null, wl = false;
  if (orgId) {
    const { data: org } = await db.from("organizations").select("logo_url, brand_color, white_label").eq("id", orgId).maybeSingle();
    logo = org?.logo_url ?? null; color = org?.brand_color ?? null; wl = org?.white_label ?? false;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <Palette className="h-6 w-6 text-gold" />
        <h1 className="font-display text-3xl font-bold">Tu marca</h1>
      </div>
      <p className="mb-8 text-sm text-muted">Personaliza cómo ven tus eventos tus asistentes — con tu logo, tu color y, si quieres, sin que se vea ShaarPass.</p>

      {orgId ? (
        <BrandingManager orgId={orgId} initialLogo={logo} initialColor={color} initialWhiteLabel={wl} />
      ) : (
        <div className="glass rounded-3xl p-6 text-sm text-muted">Crea tu primer evento para tener una organización y personalizar tu marca.</div>
      )}
    </div>
  );
}
