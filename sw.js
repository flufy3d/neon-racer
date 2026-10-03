const CACHE = 'neon-racer-v44';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './js/audio.js',
  './js/audio/score.js',
  './js/audio/synth.js',
  './js/audio/transport.js',
  './js/core/constants.js',
  './js/core/dom.js',
  './js/core/quality.js',
  './js/core/state.js',
  './js/debug/bench.js',
  './js/debug/inspect.js',
  './js/entities/obstacles.js',
  './js/entities/particles.js',
  './js/entities/ship-pose.js',
  './js/entities/ship.js',
  './js/entities/spawner.js',
  './js/game.js',
  './js/game/achievements.js',
  './js/game/hud.js',
  './js/game/input.js',
  './js/game/loop.js',
  './js/game/phases/ambient.js',
  './js/game/phases/control.js',
  './js/game/phases/feedback.js',
  './js/game/phases/pickups.js',
  './js/game/phases/progress.js',
  './js/game/phases/world.js',
  './js/game/session.js',
  './js/scene/ground.js',
  './js/scene/materials.js',
  './js/scene/palette.js',
  './js/scene/setup.js',
  './js/scene/sky.js',
  './js/scene/textures.js',
  './js/scene/tv-post.js',
  './js/scene/warmup.js',
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
    // 导航请求可能带 ?tv=1、?bench=1 等查询参数：统一以 index.html 为键缓存、忽略查询参数读取，
    // 断网时任何带参数的入口都能命中，也不会每种参数组合各存一份
    const cacheKey = isNavigate ? './index.html' : e.request;
    const fromCache = () => caches.match(cacheKey, { ignoreSearch: isNavigate });
    e.respondWith(
      fetch(netReq)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(cacheKey, copy));
            return res;
          }
          return fromCache().then(cached => cached || res);
        })
        .catch(() => fromCache())
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
