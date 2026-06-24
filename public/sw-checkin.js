// Service worker del módulo de Check-In (scope /checkin).
// Runtime caching: la app sigue cargando sin conexión tras el primer uso en línea.
const CACHE = "shaarpass-checkin-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Las APIs siempre van a la red (el modo offline lo maneja la app con su cola).
  if (url.pathname.startsWith("/api/")) return;

  // Navegación: red primero, con respaldo a caché (y al shell /checkin).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, c)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match("/checkin")))
    );
    return;
  }

  // Estáticos (_next/static, imágenes, fuentes, manifest): caché primero, runtime.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req)
        .then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((cache) => cache.put(req, c)); } return res; })
        .catch(() => cached)
    )
  );
});
