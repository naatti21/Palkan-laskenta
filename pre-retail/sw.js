if (self.location.origin !== CONFIG.origin) throw new Error("Pre-retail origin mismatch");
const prefix = "palkka-pre-retail-v-";
const current = prefix + CONFIG.revision;
const assets = new Set(CONFIG.assets.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(current)
    .then(cache => cache.addAll([...assets].map(url => new Request(url, {cache: "reload", redirect: "error"}))))
    .catch(async error => {
      await caches.delete(current);
      throw error;
    }));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(prefix) && key !== current).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate" && url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"index.html".length);
    if (assets.has(url.href)) {
      event.respondWith(Response.redirect(url.href, 308));
      return;
    }
  }
  if (!assets.has(event.request.url)) return;
  event.respondWith(caches.open(current).then(cache =>
    cache.match(event.request).then(response => response || fetch(event.request))));
});
