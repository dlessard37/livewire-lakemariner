// LIVE WIRE — service worker
// Precaches the app shell + assets. Core code files are network-first so new
// versions land immediately; heavy static assets are cache-first.

const CACHE_VERSION = 'livewire-v119';

// small, frequently-edited files: prefer the network, fall back to cache
// (resolved against the SW scope so subpath hosting still works)
const NETWORK_FIRST = new Set(
  ['./', 'index.html', 'style.css', 'game.js', 'props.js', 'manifest.json', 'sw.js', 'assets/voice/map.json'].map(
    (p) => new URL(p, self.registration.scope).pathname
  )
);

const PRECACHE_URLS = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'props.js',
  'manifest.json',
  'vendor/three.module.min.js',
  'vendor/BufferGeometryUtils.js',
  'assets/title_site.jpg',
  'assets/utah_title.jpg',
  'assets/tremont_title.jpg',
  'assets/utah_portrait.jpg',
  'assets/tremont_portrait.jpg',
  'assets/lugo_portrait.jpg',
  'assets/lemon_portrait.jpg',
  'assets/drew_portrait.jpg',
  'assets/joe_portrait.jpg',
  'assets/chris_portrait.jpg',
  'assets/don_portrait.jpg',
  'assets/safety_portrait.jpg',
  'assets/redbeard_portrait.jpg',
  'assets/andy_portrait.jpg',
  'assets/nate_portrait.jpg',
  'assets/kenny_portrait.jpg',
  'assets/vista_data.jpg',
  'assets/vista_data2.jpg',
  'assets/vista_fan.jpg',
  'assets/vista_hall.jpg',
  'assets/prints_nac.jpg',
  'assets/prints_nac_detail.jpg',
  'assets/prints_xtri.jpg',
  'assets/prints_vesda.jpg',
  'assets/prints_pull.jpg',
  'assets/prints_plan.jpg',
  'assets/tex_gravel.jpg',
  'assets/tex_concrete.jpg',
  'assets/tex_metal.jpg',
  'assets/tex_panel.jpg',
  'assets/tex_sky.jpg',
  'assets/ref_elec.jpg',
  'assets/ref_mech.jpg',
  'assets/icon_tools.png',
  'assets/icon_conduit.png',
  'assets/icon_box.png',
  'assets/icon_smoke.png',
  'assets/icon_strobe.png',
  'assets/icon_facp.png',
  'assets/btn_act.png',
  'assets/btn_act_pressed.png',
  'assets/btn_jump.png',
  'assets/btn_jump_pressed.png',
  'assets/icon_192.png',
  'assets/icon_512.png',
  'assets/voice/map.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Add each URL individually so one missing file doesn't fail the install.
      // cache:'reload' bypasses the HTTP cache so a fresh install can't
      // precache an hour-stale game.js next to a new index.html.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Same-origin GET requests only.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const stash = (response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
    }
    return response;
  };

  const matchAny = async () => {
    const exact = await caches.match(request);
    if (exact) return exact;
    const cache = await caches.open(CACHE_VERSION);
    const keys = await cache.keys();
    const hit = keys.find((k) => new URL(k.url).pathname === url.pathname);
    if (hit) return cache.match(hit);
    return caches.match(url.pathname);
  };

  const isCode = /\.(js|css|json|map)$/i.test(url.pathname) || url.pathname.endsWith('/sw.js');
  const isPortrait = /_portrait\.jpe?g$/i.test(url.pathname);

  if (NETWORK_FIRST.has(url.pathname) || isPortrait) {
    event.respondWith(
      fetch(request)
        .then(stash)
        .catch(async () => {
          const cached = await matchAny();
          if (cached) return cached;
          // never serve the HTML shell as JS/CSS — that bricks the installed app
          if (isCode) return new Response('/* offline */', { status: 504, headers: { 'Content-Type': 'text/plain' } });
          // ...and never as an image either — a broken <img> beats an HTML-as-jpg one
          if (request.destination === 'image')
            return new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } });
          return caches.match('index.html');
        })
    );
    return;
  }

  event.respondWith(
    matchAny().then((cached) => cached || fetch(request).then(stash))
  );
});
