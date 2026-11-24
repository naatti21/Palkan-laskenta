if (self.location.origin !== CONFIG.origin) throw new Error("Pre-retail origin mismatch");
const prefix = "palkka-pre-retail-v-";
const current = prefix + CONFIG.revision;
const assets = new Set(CONFIG.assets.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil(caches.open(current)
    .then(cache => cache.addAll([...assets].map(url => new Request(url, {cache: "reload"}))))
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
  if (event.request.method !== "GET" || !assets.has(event.request.url)) return;
  event.respondWith(caches.open(current).then(cache =>
    cache.match(event.request).then(response => response || fetch(event.request))));
});
