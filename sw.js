const CACHE = 'neon-racer-v11';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './js/game.js',
  './js/audio.js',
  './js/ui.js',
  './vendor/three.module.js',
  './vendor/addons/postprocessing/EffectComposer.js',
  './vendor/addons/postprocessing/RenderPass.js',
  './vendor/addons/postprocessing/UnrealBloomPass.js',
  './vendor/addons/postprocessing/Pass.js',
  './vendor/addons/postprocessing/ShaderPass.js',
  './vendor/addons/postprocessing/MaskPass.js',
  './vendor/addons/shaders/CopyShader.js',
  './vendor/addons/shaders/LuminosityHighPassShader.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(
        ASSETS.map(url =>
          fetch(new Request(url, { cache: 'reload' })).then(res => {
            if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.status}`);
            return c.put(url, res);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  const isNavigate = e.request.mode === 'navigate';
  const isFirstParty = isNavigate ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/') ||
    url.pathname.includes('/js/') ||
    url.pathname.endsWith('/style.css');

  if (isFirstParty) {
    const netReq = isNavigate ? e.request : new Request(e.request.url, { cache: 'no-cache' });
    e.respondWith(
      fetch(netReq)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
            return res;
          }
          return caches.match(e.request).then(cached => cached || res);
        })
        .catch(() =>
          caches.match(e.request).then(cached => {
            if (cached) return cached;
            if (isNavigate) return caches.match('./index.html');
            return undefined;
          })
        )
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(hit =>
        hit ||
        fetch(e.request).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
      )
    );
  }
});
