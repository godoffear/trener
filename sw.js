// Тренер: работа без интернета.
// При установке кладёт в кэш всё приложение, включая фото упражнений (берёт список из js/exercises.js).
// Дальше отдаёт файлы из кэша сразу, а свежую версию тихо подтягивает в фоне.
// При выпуске подними VERSION (вместе с APP_VERSION в js/app.js) — так телефон заберёт обновление.
const VERSION = '0.8';
const CACHE = 'trener-' + VERSION;
importScripts('js/exercises.js');
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/app.css',
  './js/exercises.js', './js/program.js', './js/db.js', './js/quotes.js', './js/app.js', './js/workout.js',
  './fonts/Manrope.woff2', './fonts/Unbounded.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon.png'];
const PHOTOS = [...new Set(Object.values(EX).map(e => e.img))].flatMap(img => [`./img/ex/${img}/0.jpg`, `./img/ex/${img}/1.jpg`]);
const PAGE = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await Promise.all(PHOTOS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('trener-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  const key = r.mode === 'navigate' ? PAGE : r;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: r.mode === 'navigate' });
    const net = fetch(r).then(res => { if (res.ok) c.put(key, res.clone()); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
// Нажатие на уведомление «Отдых закончился» — открыть приложение
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
