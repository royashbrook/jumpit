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
//   3. only ok responses are cached, and the write is wrapped in waitUntil. the
//      worker can be killed the instant respondWith settles, and a dropped put
//      means the next offline load serves the PREVIOUS deployment's shell.
//
// bump CACHE when the shell list changes.
const CACHE = 'jumpit-v0.5.0'
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './audio.js',
  './game.js',
  './levels.js',
  './save.js',
  './engine/physics.js',
  './version.js',
  './seed.js',
  './install.js',
  './update.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './assets/backgrounds/garden-walk.png',
  './assets/sprites/courier-sheet.png',
  './assets/sprites/world-sheet.png',
]

self.addEventListener('install', event => {
  // one bad url must not fail the whole install, so each is added on its own
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(SHELL.map(url => cache.add(url).catch(() => {})))),
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
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
        .then(response => {
          if (response.ok) event.waitUntil(store(request, response))
          return response
        })
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
