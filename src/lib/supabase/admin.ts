import { createClient } from "@supabase/supabase-js";

// Defensa en profundidad: si este módulo (service_role, bypassa RLS) llegara a
// ejecutarse en el navegador, abortamos. El código server nunca toca esta rama.
if (typeof window !== "undefined") {
  throw new Error("createAdminClient() es solo de servidor y no debe importarse en el cliente.");
}

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
