/**
 * Validación de configuración. NO se ejecuta al importar (el build corre con
 * placeholders); se invoca en runtime desde /api/ready y en tests. Nunca expone
 * valores: solo reporta qué variables faltan por NOMBRE.
 */
import { z } from "zod";

/** Requeridas para que el core (pagos, auth, email, cron) funcione en producción. */
const requiredServer = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),
});

export type EnvReport = { ok: boolean; missing: string[]; invalid: string[] };

/** Valida el entorno (o un objeto dado, para tests). Devuelve solo nombres, nunca valores. */
export function validateEnv(source: Record<string, unknown> = process.env): EnvReport {
  const r = requiredServer.safeParse(source);
  if (r.success) return { ok: true, missing: [], invalid: [] };

  const missing: string[] = [];
  const invalid: string[] = [];
  for (const issue of r.error.issues) {
    const key = String(issue.path[0]);
    const present = source[key] !== undefined && source[key] !== "";
    (present ? invalid : missing).push(key);
  }
  return { ok: false, missing: [...new Set(missing)], invalid: [...new Set(invalid)] };
}
