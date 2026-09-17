/// <reference lib="webworker" />
export {}
const worker = self as unknown as ServiceWorkerGlobalScope
const CACHE = `jumpit-${__BUILD_ID__}`
declare const __PRECACHE_ASSETS__: string[]
const SHELL = __PRECACHE_ASSETS__

worker.addEventListener('install', event => {
  // Old installed updaters watch controllerchange, not waiting. Retain that protocol:
  // a complete candidate activates, but only the player's update button reloads the page.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => worker.skipWaiting()))
})

worker.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const migrateV15 = (await caches.keys()).includes('jumpit-v1.5.0')
    await worker.clients.claim()
    if (!migrateV15) return
    const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Retire only the obsolete bridge marker. Other old caches remain for open old tabs.
    await caches.delete('jumpit-v1.5.0')
    for (const client of clients.filter(client => client.url.startsWith(worker.registration.scope))) {
      // Awaiting navigation here deadlocks the navigation against activation.
      void client.navigate(client.url).catch(() => {})
    }
  })())
})

worker.addEventListener('message', event => {
  if (event.data === 'jumpit:generation') event.ports[0]?.postMessage(CACHE)
  if (event.data?.type !== 'CLIENT_GENERATION' || event.data.generation !== CACHE) return
  event.waitUntil((async () => {
    const clients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Only the sole, matching current client can retire old generations. An installing
    // candidate and a second tab may still need their own immutable asset snapshots.
    if (clients.length !== 1 || !clients[0]?.url.startsWith(worker.registration.scope) || !event.source || !('id' in event.source) ||
      clients[0]?.id !== event.source.id || worker.registration.installing || worker.registration.waiting) return
    await Promise.all((await caches.keys())
      .filter(key => key.startsWith('jumpit-') && key !== CACHE)
      .map(key => caches.delete(key)))
  })())
})

worker.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== worker.location.origin || url.searchParams.has('update-probe')) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const scope = new URL(worker.registration.scope)
    const entry = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`
    const navigation = request.mode === 'navigate'
    const hit = await cache.match(navigation && entry ? new URL('./', scope).href : request)
    if (hit) {
      return navigation && hit.redirected
        ? new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: hit.headers })
        : hit
    }
    // A held old page can still request its old hashed modules after a newer worker claims it.
    const previous = await caches.match(request)
    if (previous) return previous
    try { return await fetch(request) }
    catch { return Response.error() }
  })())
})
