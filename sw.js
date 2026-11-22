const CACHE = 'verbes-v4';
const FILES = ['./', 'index.html', 'style.css', 'verbs.js', 'logic.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png', 'audio-index.json', 'audio-pack0.mp3', 'audio-pack1.mp3', 'audio-pack2.mp3', 'audio-pack3.mp3', 'audio-pack4.mp3', 'audio-pack5.mp3'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
