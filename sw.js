// offline shell with honest updates.
//
// this worker is the one piece of the template you should copy almost verbatim.
// the rules it encodes were each paid for by a real bug in a shipped house game:
//
//   1. navigations go network FIRST. the obvious cache-first worker pins an
//      installed client to the first shell it ever saw, and NO deploy can ever
//      reach it again while online. offline falls back to the cached shell.
//   2. the update probe is passed straight through. a cached answer there would
//      hide every new deployment from the update banner, silently.
//   3. only ok asset responses are cached, and the write is wrapped in waitUntil.
//      navigations never rewrite the active version cache: a newer html response
//      is not coherent until that newer worker atomically installs every asset.
//   4. the complete shell installs atomically. one missing file rejects the new
//      worker, so it cannot replace a known-good offline version with half a game.
//
// bump CACHE whenever a cached shell file changes, including within a release candidate.
const CACHE = 'jumpit-v2.0.0-r11'
const SHELL = [
  './',
  './index.html',
  './app.css?v=10',
  './app.js?v=9',
  './audio.js',
  './daily.js',
  './game.js?v=7',
  './levels.js',
  './release.js',
  './save.js',
  './engine/physics.js',
  './engine/simulation.js',
  './version.js',
  './seed.js',
  './install.js',
  './update.js?v=4',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './assets/backgrounds/garden-walk.webp',
  './assets/backgrounds/region-atlas.webp',
  './assets/backgrounds/final-atlas.webp',
  './assets/sprites/courier-sheet.webp',
  './assets/sprites/world-sheet.webp',
  './assets/sprites/region-sheet.webp',
  './assets/sprites/final-sheet.webp',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const migrateV15 = keys.includes('jumpit-v1.5.0')
    await Promise.all(keys
      .filter(key => key.startsWith('jumpit-') && key !== CACHE)
      .map(key => caches.delete(key)))
    await self.clients.claim()
    if (!migrateV15) return

    // v1.5 had no controllerchange listener, so claiming it cannot reload its old
    // modules. this one-release bridge moves only clients in this worker's scope;
    // later releases use update.js and will not take this branch after v1.5 is gone.
    const clients = await self.clients.matchAll?.({ type: 'window', includeUncontrolled: true }) || []
    const scope = self.registration?.scope || `${self.location.origin}/`
    // Do not await navigate here: the navigation waits for activation to settle.
    for (const client of clients.filter(client => client.url.startsWith(scope))) {
      void client.navigate(client.url).catch(() => {})
    }
  })())
})

function store(request, response) {
  const copy = response.clone()
  return caches.open(CACHE).then(cache => cache.put(request, copy))
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return
  if (new URL(request.url).searchParams.has('update-probe')) return // rule 2

  if (request.mode === 'navigate') { // rule 1
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) event.waitUntil(store(request, response))
      return response
    })),
  )
})
