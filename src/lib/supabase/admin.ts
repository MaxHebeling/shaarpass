import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service role — BYPASSEA RLS. Solo en servidor (webhooks, jobs).
 * Nunca lo importes en código que llegue al cliente.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
