/**
 * Rate limiting compartido, con degradación graciosa.
 *
 * Orden de backends (el primero disponible gana):
 *   1. Upstash Redis  — O(1), global, sobrevive a cold starts. Requiere
 *      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (las mismas que ya usa
 *      la cola del edge).
 *   2. Postgres       — RPC `hit_rate_limit` (migración 0023). Es lo que había
 *      antes; sigue siendo el respaldo si Upstash no está configurado o falla.
 *   3. Ninguno        — se PERMITE la petición (fail-open) y se registra un warn.
 *
 * Por qué fail-open: estas son rutas públicas de cara al comprador. Que el
 * limitador se caiga no debe tumbar la venta; el abuso se detecta en los logs
 * (`backend: "none"`) y el respaldo real anti-bot es Turnstile.
 *
 * Ventana fija por bucket de tiempo: la clave incluye floor(now/window), así que
 * el contador se "reinicia" solo al cambiar de bucket — sin cron ni borrados.
 */
import { Redis } from "@upstash/redis";
import { log } from "@/lib/log";

export type RateLimitBackend = "upstash" | "postgres" | "none";

export interface RateLimitResult {
  /** false = hay que responder 429. */
  ok: boolean;
  backend: RateLimitBackend;
  /** Segundos hasta que se libere la ventana (para la cabecera Retry-After). */
  retryAfterSeconds: number;
}

/** Contador incremental con expiración. Inyectable para tests. */
export interface RateLimitStore {
  /** Incrementa y devuelve el conteo de la ventana actual. */
  hit(key: string, windowSeconds: number): Promise<number>;
}

/** Cliente mínimo de Supabase que necesitamos (evita atarnos al tipo completo). */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

// ─── helpers puros (testeables sin red) ──────────────────────────────────────

/** Clave por ventana: mismo bucket ⇒ mismo contador. */
export function windowKey(key: string, windowSeconds: number, nowMs: number): string {
  return `rl:${key}:${Math.floor(nowMs / 1000 / windowSeconds)}`;
}

/** Segundos que faltan para cerrar la ventana actual (mínimo 1). */
export function retryAfterSeconds(windowSeconds: number, nowMs: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.max(1, Math.ceil((windowMs - (nowMs % windowMs)) / 1000));
}

/** IP del cliente detrás del proxy de Vercel. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "local";
}

// ─── backend Upstash ─────────────────────────────────────────────────────────

let _redis: Redis | null = null;
let _warnedNoBackend = false;

export function isUpstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function upstashStore(): RateLimitStore | null {
  if (!isUpstashConfigured()) return null;
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  const redis = _redis;
  return {
    async hit(key, windowSeconds) {
      const pipe = redis.pipeline();
      pipe.incr(key);
      // TTL = ventana + 1s. La clave ya es única por bucket, así que refrescar el
      // TTL en cada hit no alarga la ventana efectiva: solo limpia más tarde.
      pipe.expire(key, windowSeconds + 1);
      const [count] = (await pipe.exec()) as [number, number];
      return Number(count);
    },
  };
}

/** Solo para tests: descarta el cliente memorizado. */
export function __resetRateLimitClient(): void {
  _redis = null;
  _warnedNoBackend = false;
}

// ─── API principal ───────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Identificador lógico, p. ej. `lead:1.2.3.4`. */
  key: string;
  /** Peticiones permitidas por ventana. */
  max: number;
  /** Tamaño de la ventana en segundos. */
  windowSeconds: number;
  /** Cliente Supabase para el respaldo en Postgres. */
  db?: RpcClient | null;
  /** Inyección para tests. */
  store?: RateLimitStore | null;
  now?: number;
}

export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { key, max, windowSeconds, db = null } = opts;
  const now = opts.now ?? Date.now();
  const retry = retryAfterSeconds(windowSeconds, now);

  const store = opts.store !== undefined ? opts.store : upstashStore();
  if (store) {
    try {
      const count = await store.hit(windowKey(key, windowSeconds, now), windowSeconds);
      return { ok: count <= max, backend: "upstash", retryAfterSeconds: retry };
    } catch (err) {
      // Upstash caído → no bloqueamos la venta: seguimos al respaldo.
      log.warn("rate-limit: Upstash falló, uso el respaldo de Postgres", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (db) {
    try {
      const { data, error } = await db.rpc("hit_rate_limit", {
        p_key: key,
        p_max: max,
        p_window_seconds: windowSeconds,
      });
      if (!error && data !== null && data !== undefined) {
        return { ok: data !== false, backend: "postgres", retryAfterSeconds: retry };
      }
      log.warn("rate-limit: hit_rate_limit no devolvió veredicto", { key });
    } catch (err) {
      log.warn("rate-limit: hit_rate_limit falló", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!_warnedNoBackend) {
    _warnedNoBackend = true;
    log.warn("rate-limit: sin backend disponible, permitiendo tráfico (fail-open)", { key });
  }
  return { ok: true, backend: "none", retryAfterSeconds: retry };
}

/** Cabeceras estándar para una respuesta 429. */
export function retryAfterHeaders(result: RateLimitResult): Record<string, string> {
  return { "Retry-After": String(result.retryAfterSeconds) };
}
