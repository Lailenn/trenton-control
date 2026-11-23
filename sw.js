/* Service worker: lets the installed app open without internet.
   - The page (index.html) is fetched from the network first, so updates show right away;
     the saved copy is used only when offline.
   - App files (?v= versioned scripts, styles, images) and the libraries from the CDNs are
     served from the cache and refreshed in the background.
   - Cloud data (Supabase) is never cached here: it always goes to the network. */
const CACHE = "rp-app-v1";
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["./", "./index.html", "./manifest.webmanifest", "./assets/icon-192.png", "./assets/icon-512.png"])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put("./index.html", response.clone());
    return response;
  } catch (_) {
    return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
  }
}
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const update = fetch(event.request).then(response => {
    if (response && (response.ok || response.type === "opaque")) cache.put(event.request, response.clone());
    return response;
  }).catch(() => cached);
  if (cached) { event.waitUntil(update); return cached; }
  return update;
}

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === location.origin) { event.respondWith(networkFirst(request)); return; }
  if (url.origin === location.origin) {
    // Versioned app files and images; skip anything that is not a plain static file.
    if (/\.(js|css|png|jpe?g|webp|svg|ico|woff2?|webmanifest|json)$/i.test(url.pathname)) event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (CDN.test(request.url)) event.respondWith(staleWhileRevalidate(event));
});
