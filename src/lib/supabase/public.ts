import { createClient } from "@supabase/supabase-js";

/**
 * Cliente público de solo lectura (sin sesión). Para páginas públicas como
 * la del evento. RLS permite leer eventos 'published' y sus ticket_types.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
