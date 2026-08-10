/** fetch con timeout (aborta si el servicio externo se cuelga). */
export async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 45_000): Promise<Response> {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}
