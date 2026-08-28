// Versioned offline shell: network-first navigation and update probes, atomic
// installation, and immutable active caches. Bump CACHE with any shell change.
const CACHE = 'jumpit-v2.0.0-r19'
const SHELL = [
  './',
  './index.html',
  './app.css?v=10',
  './app.js?v=17',
  './audio.js?v=2',
  './daily.js',
  './game.js?v=14',
  './levels.js?v=2',
  './release.js',
  './save.js?v=2',
  './engine/physics.js?v=2',
  './engine/simulation.js?v=2',
  './version.js',
  './seed.js',
  './install.js',
  './update.js?v=7',
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

self.addEventListener('message', event => {
  if (event.data === 'jumpit:generation') event.ports[0]?.postMessage(CACHE)
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
