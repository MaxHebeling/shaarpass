import { createHmac } from "crypto";
import { Redis } from "@upstash/redis";

/**
 * Cola en el edge para onsales masivos (millones simultáneos).
 * - Contador atómico en Upstash Redis (INCR O(1)) asigna la posición N al unirse.
 * - Admisión por TIEMPO PURO: admitidos(now) = waveSize · (floor((now-onsale)/interval)+1).
 *   No hay cron ni escrituras de admisión → cada request es 1 op O(1).
 * - Token firmado (HMAC) con la posición N; checkout lo verifica sin tocar la DB.
 *
 * Activo solo si UPSTASH_REDIS_REST_URL/TOKEN están configurados; si no, el sistema
 * usa la cola en Postgres (decenas de miles). Es el upgrade de escala.
 */
const ADMIT_INTERVAL_SEC = 15;

export function isEdgeQueue(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function redis(): Redis {
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
}

function secret(): string {
  return process.env.QUEUE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "shaarpass-queue";
}
function sign(eventId: string, n: number): string {
  const mac = createHmac("sha256", secret()).update(`${eventId}.${n}`).digest("hex").slice(0, 16);
  return `${n}.${mac}`;
}
function parse(eventId: string, token: string): number | null {
  const [nStr, mac] = (token || "").split(".");
  const n = Number(nStr);
  if (!Number.isInteger(n) || !mac) return null;
  const expected = createHmac("sha256", secret()).update(`${eventId}.${n}`).digest("hex").slice(0, 16);
  return mac === expected ? n : null;
}

/** Cuántos han sido admitidos a esta hora (función pura del tiempo). */
export function admittedCount(onsaleAt: string | null, waveSize: number): number {
  if (!onsaleAt) return 0;
  const elapsed = (Date.now() - new Date(onsaleAt).getTime()) / 1000;
  if (elapsed < 0) return 0;
  return waveSize * (Math.floor(elapsed / ADMIT_INTERVAL_SEC) + 1);
}

export async function edgeJoin(eventId: string, onsaleAt: string | null, waveSize: number) {
  const n = await redis().incr(`q:${eventId}:issued`);
  const admitted = admittedCount(onsaleAt, waveSize);
  return { token: sign(eventId, n), pos: n, status: n <= admitted ? "admitted" : "waiting", ahead: Math.max(0, n - admitted) };
}

export function edgeStatus(eventId: string, token: string, onsaleAt: string | null, waveSize: number) {
  const n = parse(eventId, token);
  if (n == null) return { status: "unknown" as const };
  const admitted = admittedCount(onsaleAt, waveSize);
  return { status: n <= admitted ? "admitted" : "waiting", pos: n, ahead: Math.max(0, n - admitted) };
}

export function edgeAdmitted(eventId: string, token: string, onsaleAt: string | null, waveSize: number): boolean {
  const n = parse(eventId, token);
  if (n == null) return false;
  return n <= admittedCount(onsaleAt, waveSize);
}
