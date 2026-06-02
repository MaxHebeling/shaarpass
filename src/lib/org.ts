import type { SupabaseClient } from "@supabase/supabase-js";

export interface UserOrg {
  id: string;
  name: string;
  stripe_account_id: string | null;
  payouts_enabled: boolean;
}

/** Devuelve la organización del usuario autenticado (la primera donde es miembro). */
export async function getUserOrg(db: SupabaseClient): Promise<UserOrg | null> {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;

  const { data } = await db
    .from("org_members")
    .select("organizations(id, name, stripe_account_id, payouts_enabled)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const org = (data as { organizations: UserOrg | null } | null)?.organizations;
  return org ?? null;
}
