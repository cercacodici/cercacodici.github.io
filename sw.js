/* Cache per uso offline. Strategia: prima la rete (dati sempre aggiornati), la copia salvata solo se manca la connessione. */
const CACHE = "cercacodici-71c4d205cbb8";
const FILES = ["./", "index.html", "style.css", "app.js", "dx.json", "px.json", "manifest.webmanifest", "icon-192.png", "icon-512.png", "favicon-32.png", "apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match("./"))));
});
