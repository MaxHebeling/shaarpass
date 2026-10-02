import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** fetch con timeout (aborta si el servicio externo se cuelga). */
export async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 45_000): Promise<Response> {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

/** ¿La IP cae en un rango privado/interno que no debe alcanzarse desde el servidor? */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 127) return true;                      // loopback
    if (a === 0) return true;                        // 0.0.0.0/8
    if (a === 169 && b === 254) return true;         // link-local / metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;         // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (v === "::1" || v === "::") return true;        // loopback / unspecified
  if (v.startsWith("fe80")) return true;             // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique-local fc00::/7
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7)); // IPv4-mapped
  return false;
}

/**
 * Valida una URL provista por el usuario antes de que el servidor la solicite (anti-SSRF).
 * Exige http/https y resuelve el host: si CUALQUIER dirección resuelta es interna
 * (loopback, link-local, metadata 169.254.169.254, rangos privados), la rechaza.
 * Devuelve la URL normalizada o lanza un Error con mensaje seguro.
 */
export async function assertPublicHttpUrl(raw: string): Promise<string> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("URL inválida"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("esquema de URL no permitido");
  const host = u.hostname;
  // Si el host ya es una IP, valídala directo.
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("destino no permitido");
    return u.toString();
  }
  // Resuelve TODAS las direcciones y rechaza si alguna es interna (evita rebinding por multi-registro).
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new Error("no se pudo resolver el host"); }
  if (addrs.length === 0) throw new Error("no se pudo resolver el host");
  for (const a of addrs) if (isPrivateAddress(a.address)) throw new Error("destino no permitido");
  return u.toString();
}
