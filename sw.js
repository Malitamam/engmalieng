// ENGMAliENG service worker – çevrimdışı çalışma
var VERSION = 'engm-v0.3.1';
var SHELL = ['./', 'index.html', 'app.js', 'data.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION && k.indexOf('engm-') === 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === location.origin) {
    // uygulama dosyaları: önce ağ (güncel sürüm), ağ yoksa önbellek
    e.respondWith(fetch(req).then(function (res) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); return res; }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); }));
  } else if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    // yazı tipleri: önbellekten, arka planda yenile
    e.respondWith(caches.open('engm-fonts').then(function (c) { return c.match(req).then(function (hit) { var net = fetch(req).then(function (res) { c.put(req, res.clone()); return res; }).catch(function () { return hit; }); return hit || net; }); }));
  }
});
