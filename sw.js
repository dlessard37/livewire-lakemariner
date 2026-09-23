// Release preparation changes this version for each published build.
const CACHE_VERSION = 'livewire-rebuild-20260923-01';
const SHELL = ['./','index.html','manifest.json','style.css','rebuild.css','mobile.css','modules/config.js','modules/app-updates.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache =>
    Promise.allSettled(SHELL.map(url => cache.add(new Request(url,{cache:'reload'}))))
  ).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('livewire-') && key !== CACHE_VERSION)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const code = /\.(?:html?|[cm]?js|css|json|webmanifest|map)$/i.test(url.pathname);
  const navigation = request.mode === 'navigate';
  const currentCache = () => caches.open(CACHE_VERSION);
  const stored = async () => { try { return await (await currentCache()).match(request); } catch (_) { return undefined; } };
  const network = async () => {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      try { const cache = await currentCache(); await cache.put(request,response.clone()); } catch (_) {}
    }
    return response;
  };
  if (code || navigation || url.pathname.endsWith('/')) {
    event.respondWith(network().catch(async () => {
      const cached = await stored();
      if (cached) return cached;
      if (navigation) {
        let shell;try { shell = await (await currentCache()).match(new URL('index.html',self.registration.scope).href); } catch (_) {}
        if (shell) return shell;
      }
      return new Response('Connection needed to load this game file.',{status:504,headers:{'Content-Type':'text/plain'}});
    }));
  } else {
    event.respondWith(stored().then(cached => cached || network()));
  }
});
