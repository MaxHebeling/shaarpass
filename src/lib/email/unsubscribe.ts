/**
 * Firma y verificación del enlace de "darse de baja".
 *
 * Vive en su propio módulo (y no dentro de `campaigns.ts`) por dos razones:
 * la página pública `/unsubscribe` no necesita arrastrar el SDK de Resend, y
 * esto es código de seguridad que merece leerse y probarse por separado.
 *
 * ── Por qué firma con varios secretos ────────────────────────────────────────
 * Un enlace de baja roto no es un fallo cosmético: las leyes anti-spam exigen
 * que funcione. Los correos ya enviados llevan la firma vieja impresa y no se
 * pueden reescribir, así que **el primer secreto firma y TODOS verifican**. Eso
 * permite rotar el secreto sin invalidar lo que ya salió por correo.
 *
 * ── Historia, para que se entienda el orden ──────────────────────────────────
 * Originalmente la firma caía por defecto en `SUPABASE_SERVICE_ROLE_KEY`, lo que
 * ataba la baja de correos a una credencial de base de datos: rotar la clave de
 * Supabase rompía todos los enlaces enviados. `UNSUBSCRIBE_SECRET` rompe ese
 * acoplamiento. `UNSUBSCRIBE_SECRET_LEGACY` guarda el valor anterior mientras
 * las campañas viejas sigan vivas, y se puede borrar cuando caduquen.
 *
 * El orden de abajo mantiene el comportamiento idéntico si no defines nada
 * nuevo: sin `UNSUBSCRIBE_SECRET` ni `QUEUE_SECRET`, firma igual que siempre.
 */
import { createHmac, timingSafeEqual } from "crypto";

type Env = Record<string, string | undefined>;

/** Secretos válidos, en orden. El primero firma; todos verifican. */
export function unsubSecrets(env: Env = process.env): string[] {
  const candidates = [
    env.UNSUBSCRIBE_SECRET,
    env.QUEUE_SECRET,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.UNSUBSCRIBE_SECRET_LEGACY,
  ].filter((v): v is string => Boolean(v && v.trim()));

  // Sin nada configurado (desarrollo local), un valor fijo: las firmas no
  // protegen nada real porque tampoco hay correos reales que enviar.
  return candidates.length ? [...new Set(candidates)] : ["shaarpass"];
}

function sign(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`unsub:${email.toLowerCase()}`).digest("hex").slice(0, 24);
}

/** Firma el enlace de baja con el secreto vigente. */
export function unsubSig(email: string, env: Env = process.env): string {
  return sign(email, unsubSecrets(env)[0]);
}

/**
 * Verifica una firma contra TODOS los secretos válidos.
 * Comparación en tiempo constante: la firma es corta y adivinable a fuerza
 * bruta si se filtra información por el tiempo de respuesta.
 */
export function verifyUnsubSig(email: string, sig: string | undefined | null, env: Env = process.env): boolean {
  if (!email || !sig) return false;
  const given = Buffer.from(sig);
  for (const secret of unsubSecrets(env)) {
    const expected = Buffer.from(sign(email, secret));
    if (expected.length !== given.length) continue;
    if (timingSafeEqual(expected, given)) return true;
  }
  return false;
}
