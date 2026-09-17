import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test as base } from 'playwright/test'

// Every primary upgrade assertion uses the actual two built apps, not a replacement entry module.
const releaseRoot = resolve(process.cwd(), process.env.JUMPIT_ROOT || 'build')
async function files(root, prefix = '') {
  const entries = await readdir(root, { withFileTypes: true })
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(resolve(root, entry.name), prefix + entry.name + '/') : prefix + entry.name))).flat().sort()
}
const currentFiles = new Map()
for (const file of await files(releaseRoot)) currentFiles.set('/' + file, await readFile(resolve(releaseRoot, file)))
currentFiles.set('/', currentFiles.get('/index.html'))
const currentIndex = currentFiles.get('/index.html').toString()
const workerSource = currentFiles.get('/sw.js').toString()
const identity = JSON.parse(currentFiles.get('/version.json'))
const currentVersion = identity.version
const currentCache = 'jumpit-' + identity.build
// Secondary protocol probe only: same compiled page, identity-only candidate worker.
// This is not a second real typed build; the r23 migration below is that release proof.
const candidateCache = currentCache + '-protocol'
const candidateWorker = workerSource.replace(currentCache, candidateCache)
assert.notEqual(candidateWorker, workerSource)
const CURRENT_URLS = {
  app: currentIndex.match(/<script[^>]+src="([^"]+)"/)?.[1],
  css: currentIndex.match(/<link[^>]+href="([^"]+\.css)"/)?.[1],
}
assert.match(CURRENT_URLS.app || '', /^\.\/assets\/app-[\w-]+\.js$/)
assert.match(CURRENT_URLS.css || '', /^\.\/assets\/app-[\w-]+\.css$/)
const REQUIRED_SHELL = ['./', ...[...currentFiles.keys()]
  .filter(path => path !== '/' && path !== '/sw.js' && path !== '/_headers').map(path => '.' + path)]
assert.ok(REQUIRED_SHELL.includes('./licenses.md'))
for (const entry of REQUIRED_SHELL) assert.ok(workerSource.includes(JSON.stringify(entry)), 'worker precache missing ' + entry)

const shippedState = JSON.parse(await readFile(new URL('../fixtures/v2.0-shipped/state.json', import.meta.url), 'utf8'))
const shippedFiles = new Map()
for (const entry of shippedState.files) {
  const bytes = entry.shared ? currentFiles.get('/' + entry.file)
    : await readFile(new URL('../fixtures/v2.0-shipped/' + entry.file, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, 'historical bytes: ' + entry.file)
  shippedFiles.set('/' + entry.file, bytes)
}
shippedFiles.set('/', shippedFiles.get('/index.html'))
const protocols = {}
for (const version of ['1.5', '1.9']) {
  protocols[version] = {
    worker: await readFile(new URL('../fixtures/v' + version + '/sw.js', import.meta.url)),
    update: await readFile(new URL('../fixtures/v' + version + '/update.js', import.meta.url)),
  }
}

function contentType(path) {
  if (path.endsWith('.html') || path === '/') return 'text/html'
  if (path.endsWith('.css')) return 'text/css'
  if (path.endsWith('.js')) return 'text/javascript'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.md')) return 'text/plain'
  return 'application/octet-stream'
}

async function startReleaseServer(initial = 'current', { holdCurrentWorker = false } = {}) {
  let release = initial
  let failedPath = null
  let workerReleased = !holdCurrentWorker
  let currentWorkerChecks = 0
  let indexOverride = null
  let heldAssetPath = null
  const heldAssets = []
  let refreshSeenResolve
  const refreshSeen = new Promise(resolveSeen => { refreshSeenResolve = resolveSeen })
  const held = []
  const requests = []
  const failures = []
  const send = (response, path, body) => response.writeHead(200, {
    'cache-control': 'no-store', 'content-type': contentType(path),
  }).end(body)
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://local.test')
    const path = url.pathname
    requests.push({ release, path: path + url.search, mode: request.headers['sec-fetch-mode'] })
    if (release === 'current' && path === failedPath) {
      failures.push(path)
      response.writeHead(404, { 'cache-control': 'no-store' }).end('required asset unavailable')
      return
    }
    if (release === 'candidate' && path === heldAssetPath) { heldAssets.push({ response, path }); return }
    if (release === 'current' && path === '/sw.js' && holdCurrentWorker) {
      currentWorkerChecks += 1
      if (currentWorkerChecks === 1) { send(response, path, shippedFiles.get('/sw.js')); return }
      if (!workerReleased) { held.push(response); refreshSeenResolve(); return }
    }
    let body
    if (protocols[release]) {
      // The old worker/updater bytes are exact; only these earlier protocol shells are synthetic.
      if (path === '/' || path === '/index.html') body = '<!doctype html><html data-release="boot"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="update" hidden>update</button><script type="module">import{VERSION}from"./version.js";import{wireUpdate,registerWorker}from"./update.js";document.documentElement.dataset.release=VERSION;const updater=wireUpdate(document.querySelector("#update"));registerWorker("sw.js",updater.reveal)</script></body></html>'
      else if (path === '/sw.js') body = protocols[release].worker
      else if (path === '/update.js') body = protocols[release].update
      else if (path === '/version.js') body = 'export const VERSION = "' + release + '.0"'
      else body = shippedFiles.get(path) || (path.endsWith('.png') ? 'legacy protocol asset' : undefined)
    } else if (release === 'candidate' && path === '/sw.js') body = candidateWorker
    else body = release === 'current' && indexOverride !== null && (path === '/' || path === '/index.html')
      ? indexOverride : (release === 'shipped' ? shippedFiles : currentFiles).get(path)
    if (body === undefined) { response.writeHead(404).end('not found'); return }
    send(response, path, body)
  })
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  return {
    origin: 'http://127.0.0.1:' + server.address().port + '/',
    requests, failures,
    use: value => { release = value },
    fail: path => { failedPath = path },
    replaceIndex: body => { indexOverride = body },
    holdAsset: path => { heldAssetPath = path },
    heldAssetCount: () => heldAssets.length,
    releaseAsset() {
      heldAssetPath = null
      for (const { response, path } of heldAssets.splice(0)) send(response, path, currentFiles.get(path))
    },
    waitForRefresh: () => refreshSeen,
    releaseWorker() {
      workerReleased = true
      for (const response of held.splice(0)) send(response, '/sw.js', workerSource)
    },
    async close() {
      for (const response of held.splice(0)) response.destroy()
      for (const { response } of heldAssets.splice(0)) response.destroy()
      server.closeAllConnections()
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
    },
  }
}

const test = base.extend({
  artifactServer: async ({}, use) => {
    const server = await startReleaseServer()
    try { await use(server) } finally { await server.close() }
  },
})
test.setTimeout(60_000)

async function install(page, origin) {
  await page.goto(origin)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.reload()
}

async function generation(page) {
  return page.evaluate(() => new Promise(resolveGeneration => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { channel.port1.close(); resolveGeneration(null) }, 3000)
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolveGeneration(event.data) }
    navigator.serviceWorker.controller.postMessage('jumpit:generation', [channel.port2])
  }))
}

async function jumpitCaches(page) {
  return page.evaluate(async () => (await caches.keys()).filter(name => name.startsWith('jumpit-')).sort())
}

async function currentProof(page) {
  const proof = await page.evaluate(async ({ cacheName, urls, required }) => {
    const cache = await caches.open(cacheName)
    const missing = []
    for (const path of required) if (!await cache.match(path)) missing.push(path)
    return {
      controlled: Boolean(navigator.serviceWorker.controller), missing,
      index: await (await cache.match('./index.html')).text(),
      app: await (await cache.match(urls.app)).text(),
      css: await (await cache.match(urls.css)).text(),
      version: await (await cache.match('./version.json')).json(),
      probe: await (await fetch('./version.js?update-probe', { cache: 'no-store' })).text(),
      licenses: await (await cache.match('./licenses.md')).text(),
    }
  }, { cacheName: currentCache, urls: CURRENT_URLS, required: REQUIRED_SHELL })
  expect(proof.controlled).toBe(true)
  expect(proof.missing).toEqual([])
  expect(proof.index).toBe(currentIndex)
  expect(proof.app).toBe(currentFiles.get(CURRENT_URLS.app.slice(1)).toString())
  expect(proof.css).toBe(currentFiles.get(CURRENT_URLS.css.slice(1)).toString())
  expect(proof.version).toEqual(identity)
  expect(proof.probe).toBe(currentFiles.get('/version.js').toString())
  expect(proof.licenses).toBe(currentFiles.get('/licenses.md').toString())
}

test('the actual installed build precaches every asset and license; Chromium reopens it cold offline', async ({ page, context, browserName, artifactServer }) => {
  await install(page, artifactServer.origin)
  await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', identity.build)
  await expect.poll(() => jumpitCaches(page)).toEqual([currentCache])
  await currentProof(page)
  if (browserName === 'webkit') return // Device offline is a separate receipt; Playwright WebKit cannot enforce it reliably.
  await page.close()
  await context.setOffline(true)
  const cold = await context.newPage()
  try {
    await cold.goto(artifactServer.origin, { waitUntil: 'domcontentloaded' })
    await expect(cold.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
    const failures = await cold.evaluate(async required => {
      const failures = []
      for (const path of required) {
        try { if (!(await fetch(path)).ok) failures.push(path) } catch { failures.push(path) }
      }
      return failures
    }, REQUIRED_SHELL)
    expect(failures).toEqual([])
    await cold.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
    await expect(cold.locator('#stage')).toBeVisible()
    await expect(cold.getByRole('button', { name: 'jump' })).toBeEnabled()
  } finally { await context.setOffline(false); await cold.close() }
})

for (const version of ['1.5', '1.9']) {
  test('exact v' + version + ' worker/updater protocol migrates once into the actual current bundle', async ({ page }) => {
    const server = await startReleaseServer(version)
    try {
      await install(page, server.origin)
      await expect(page.locator('html')).toHaveAttribute('data-release', version + '.0')
      let navigations = 0
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1 })
      server.use('current')
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
      await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', identity.build)
      await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
      await expect.poll(() => jumpitCaches(page)).toEqual([currentCache])
      expect(navigations).toBe(1)
      await currentProof(page)
      const before = navigations
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
      await expect(page.locator('#update')).toBeHidden()
      expect(navigations).toBe(before)
    } finally { await server.close() }
  })
}

test('actual shipped r23 app updates only on consent, preserves progress/preferences, and keeps its held tab coherent', async ({ page, context, browserName }) => {
  const server = await startReleaseServer('shipped')
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let held
  try {
    await install(page, server.origin)
    await expect(page.locator('#version')).toHaveText('v2.0.0')
    await page.locator('[data-tab="looks"]').click()
    await page.locator('#look-dusk').click()
    await page.locator('[data-tab="more"]').click()
    await page.locator('#sound-toggle').click()
    // Persist a real authored completion through the shipped store, not a test-only engine.
    const foreignWritten = await page.evaluate(async () => {
      const { createSaveStore } = await import('./save.js?v=4')
      const store = createSaveStore()
      store.completeLevel('garden-1', 3, 'garden-2')
      store.learnControls()
      // Seed an unrelated cache with real response bytes, not a mock worker.
      const foreign = await fetch('./version.js?update-probe', { cache: 'no-store' })
      await caches.open('unrelated-cache').then(cache => cache.put(new URL('./foreign', location.href).href, foreign))
      const cache = await caches.open('unrelated-cache')
      return { url: location.href, requests: (await cache.keys()).map(request => request.url),
        text: await (await cache.match(new URL('./foreign', location.href).href))?.text() }
    })
    expect(foreignWritten.requests).toEqual([server.origin + 'foreign'])
    expect(foreignWritten.text).toBe(shippedFiles.get('/version.js').toString())
    await page.reload()
    const saved = await page.evaluate(() => localStorage.getItem('jumpit-save-v1'))
    const foreignBefore = await page.evaluate(async () => {
      const cache = await caches.open('unrelated-cache')
      const response = await cache.match(new URL('./foreign', location.href).href)
      return { keys: await caches.keys(), requests: (await cache.keys()).map(request => request.url), url: location.href, text: response ? await response.text() : null }
    })
    expect(foreignBefore.keys).toContain('unrelated-cache')
    // Playwright WebKit drops document-written cache entries across this original
    // r23 reload, before any migration; names survive. Both browsers prove the
    // cleanup never deletes foreign caches, and Chromium also proves their bytes.
    if (browserName !== 'webkit') expect(foreignBefore.text).toBe(shippedFiles.get('/version.js').toString())
    held = await context.newPage()
    held.on('pageerror', error => errors.push(error.message))
    await held.goto(server.origin)
    await expect(held.locator('#version')).toHaveText('v2.0.0')
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1 })
    let heldNavigations = 0
    held.on('framenavigated', frame => { if (frame === held.mainFrame()) heldNavigations += 1 })
    server.use('current')
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    await expect(page.locator('#update')).toBeVisible()
    await expect(held.locator('#update')).toBeVisible()
    await expect.poll(() => generation(page)).toBe(currentCache)
    expect(navigations).toBe(0)
    expect(heldNavigations).toBe(0)
    expect(await jumpitCaches(page)).toEqual([currentCache, shippedState.cache].sort())

    await page.locator('#update').click()
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', identity.build)
    await expect(page.locator('#version')).toHaveText('v' + currentVersion)
    await expect(page.locator('#continue-label')).toHaveText('CLOVER CROSSING · 0/4 SEEDS')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk')
    await page.locator('[data-tab="more"]').click()
    await expect(page.locator('#sound-toggle')).toHaveText('SOUND OFF')
    expect(await page.evaluate(() => localStorage.getItem('jumpit-save-v1'))).toBe(saved)
    expect(navigations).toBe(1)
    await currentProof(page)

    // The other document still runs the old real entry and can request its exact module bytes.
    await expect(held.locator('#version')).toHaveText('v2.0.0')
    expect(await held.locator('script[type="module"]').getAttribute('src')).toBe('app.js?v=21')
    const oldApp = await held.evaluate(async () => (await fetch('./app.js?v=21')).text())
    expect(oldApp).toBe(shippedFiles.get('/app.js').toString())
    await held.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
    await expect(held.locator('#stage')).toBeVisible()
    await held.locator('#pause').click()
    await expect(held.locator('#resume')).toBeVisible()
    expect(heldNavigations).toBe(0)

    // Neither a wrong generation nor a current acknowledgement from one of two tabs retires history.
    await page.evaluate(generation => {
      navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_GENERATION', generation: 'wrong' })
      navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_GENERATION', generation })
    }, currentCache)
    expect(await jumpitCaches(page)).toEqual([currentCache, shippedState.cache].sort())
    await held.close()
    held = null
    await page.evaluate(() => navigator.serviceWorker.controller.postMessage({ type: 'CLIENT_GENERATION', generation: 'wrong' }))
    expect(await jumpitCaches(page)).toEqual([currentCache, shippedState.cache].sort())
    // A sole matching current page's normal startup acknowledgement is what permits retirement.
    await page.reload()
    await expect.poll(() => jumpitCaches(page)).toEqual([currentCache])
    const foreignAfter = await page.evaluate(async () => {
      const keys = await caches.keys()
      const cache = await caches.open('unrelated-cache')
      const response = await cache.match(new URL('./foreign', location.href).href)
      return { keys, text: response ? await response.text() : null }
    })
    expect(foreignAfter.keys).toContain('unrelated-cache')
    if (browserName !== 'webkit') expect(foreignAfter.text).toBe(shippedFiles.get('/version.js').toString())
    await expect(page.locator('#update')).toBeHidden()
    expect(errors).toEqual([])
  } finally { await held?.close(); await server.close() }
})

test('a current artifact already loaded through r23 accepts its own worker without a redundant toast', async ({ page }) => {
  const server = await startReleaseServer('shipped', { holdCurrentWorker: true })
  try {
    await install(page, server.origin)
    server.use('current')
    await page.reload()
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', identity.build)
    await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
    await server.waitForRefresh()
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1 })
    server.releaseWorker()
    await expect.poll(() => generation(page)).toBe(currentCache)
    await expect.poll(() => jumpitCaches(page)).toEqual([currentCache])
    await expect(page.locator('#update')).toBeHidden()
    expect(navigations).toBe(0)
    await currentProof(page)
  } finally { server.releaseWorker(); await server.close() }
})

test('a failed required asset never replaces the real r23 shell or its progress; Chromium reopens it offline', async ({ page, context, browserName }) => {
  const server = await startReleaseServer('shipped')
  try {
    await install(page, server.origin)
    await page.evaluate(async () => {
      const { createSaveStore } = await import('./save.js?v=4')
      const store = createSaveStore()
      store.completeLevel('garden-1', 2, 'garden-2')
      store.setTheme('dusk')
      store.setMuted(true)
    })
    await page.reload()
    const saved = await page.evaluate(() => localStorage.getItem('jumpit-save-v1'))
    expect(JSON.parse(saved)).toMatchObject({ selectedLevel: 'garden-2', theme: 'dusk', muted: true, bestSeeds: { 'garden-1': 2 } })
    const before = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName)
      return { index: await (await cache.match('./index.html')).text(), app: await (await cache.match('./app.js?v=21')).text() }
    }, shippedState.cache)
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1 })
    server.use('current')
    server.fail('/assets/sprites/final-sheet.webp')
    await page.evaluate(async () => { try { await (await navigator.serviceWorker.getRegistration()).update() } catch {} })
    await expect.poll(() => server.failures.length).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return !registration.installing && !registration.waiting
    })).toBe(true)
    expect(await generation(page)).toBe(shippedState.cache)
    await expect(page.locator('#version')).toHaveText('v2.0.0')
    await expect(page.locator('#update')).toBeHidden()
    expect(navigations).toBe(0)
    const after = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName)
      return { index: await (await cache.match('./index.html')).text(), app: await (await cache.match('./app.js?v=21')).text() }
    }, shippedState.cache)
    expect(after).toEqual(before)
    expect(await page.evaluate(() => localStorage.getItem('jumpit-save-v1'))).toBe(saved)
    if (browserName === 'webkit') return
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#version')).toHaveText('v2.0.0')
    await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('jumpit-save-v1'))).toBe(saved)
  } finally { await context.setOffline(false).catch(() => {}); await server.close() }
})

test('current navigation remains cache-first and immutable while deployment content changes', async ({ page, artifactServer }) => {
  await install(page, artifactServer.origin)
  const before = artifactServer.requests.filter(request => request.mode === 'navigate').length
  artifactServer.replaceIndex(shippedFiles.get('/index.html'))
  await page.reload()
  await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', identity.build)
  expect(artifactServer.requests.filter(request => request.mode === 'navigate')).toHaveLength(before)
  const snapshot = await page.evaluate(async cacheName => (await (await caches.open(cacheName)).match('./index.html')).text(), currentCache)
  expect(snapshot).toBe(currentIndex)
})

test('compiled updater protocol waits for a complete identity-only candidate worker, then reloads once on consent', async ({ page }) => {
  const server = await startReleaseServer()
  try {
    await install(page, server.origin)
    let navigations = 0
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations += 1 })
    server.holdAsset('/assets/sprites/final-sheet.webp')
    server.use('candidate')
    await page.evaluate(async () => { void (await navigator.serviceWorker.getRegistration()).update().catch(() => {}) })
    await expect.poll(() => server.heldAssetCount()).toBeGreaterThan(0)
    expect(await generation(page)).toBe(currentCache)
    await expect(page.locator('#update')).toBeHidden()
    expect(navigations).toBe(0)
    server.releaseAsset()
    await expect(page.locator('#update')).toBeVisible()
    expect(await generation(page)).toBe(candidateCache)
    expect(navigations).toBe(0)
    const candidate = await page.evaluate(async ({ name, required, app }) => {
      const cache = await caches.open(name)
      const missing = []
      for (const path of required) if (!await cache.match(path)) missing.push(path)
      return { missing, app: await (await cache.match(app)).text() }
    }, { name: candidateCache, required: REQUIRED_SHELL, app: CURRENT_URLS.app })
    expect(candidate.missing).toEqual([])
    expect(candidate.app).toBe(currentFiles.get(CURRENT_URLS.app.slice(1)).toString())
    await page.locator('#update').click()
    await expect.poll(() => navigations).toBe(1)
    await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', identity.build)
    // The bundle remains byte-identical; only the protocol worker identity changed.
    expect(navigations).toBe(1)
  } finally { server.releaseAsset(); await server.close() }
})

const ART_ASSETS = [
  { file: './assets/backgrounds/garden-walk.webp', width: 1774, height: 887, alpha: false },
  { file: './assets/backgrounds/region-atlas.webp', width: 1536, height: 1024, alpha: false },
  { file: './assets/backgrounds/final-atlas.webp', width: 1536, height: 1024, alpha: false },
  { file: './assets/sprites/courier-sheet.webp', width: 768, height: 512, alpha: true },
  { file: './assets/sprites/world-sheet.webp', width: 768, height: 512, alpha: true },
  { file: './assets/sprites/region-sheet.webp', width: 768, height: 512, alpha: true },
  { file: './assets/sprites/final-sheet.webp', width: 768, height: 512, alpha: true },
]


test('every shipped WebP has the right MIME, decodes, and preserves sprite alpha', async ({ page, artifactServer }) => {
  await page.goto(artifactServer.origin)
  const proof = await page.evaluate(async assets => {
    const results = []
    for (const asset of assets) {
      const response = await fetch(asset.file, { cache: 'no-store' })
      const image = new Image()
      image.src = asset.file
      await image.decode()
      let transparent = false
      if (asset.alpha) {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] < 255) { transparent = true; break }
        }
      }
      results.push({
        file: asset.file,
        ok: response.ok,
        contentType: response.headers.get('content-type')?.split(';')[0],
        width: image.naturalWidth,
        height: image.naturalHeight,
        transparent,
      })
    }
    return results
  }, ART_ASSETS)

  expect(proof).toEqual(ART_ASSETS.map(asset => ({
    file: asset.file,
    ok: true,
    contentType: 'image/webp',
    width: asset.width,
    height: asset.height,
    transparent: asset.alpha,
  })))
})


test('first play assigns only the three Garden canvas WebPs', async ({ page, artifactServer }) => {
  await page.addInitScript(() => {
    const NativeImage = window.Image
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
    window.__jumpitImageSources = []
    window.Image = function Image(...args) {
      const image = new NativeImage(...args)
      Object.defineProperty(image, 'src', {
        configurable: true,
        get() { return descriptor.get.call(this) },
        set(value) {
          if (value) window.__jumpitImageSources.push(value)
          descriptor.set.call(this, value)
        },
      })
      return image
    }
    window.Image.prototype = NativeImage.prototype
  })
  await page.goto(artifactServer.origin)
  expect(await page.evaluate(() => window.__jumpitImageSources)).toEqual([])
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect.poll(() => page.evaluate(() => window.__jumpitImageSources)).toHaveLength(3)
  expect((await page.evaluate(() => window.__jumpitImageSources)).sort()).toEqual([
    'assets/backgrounds/garden-walk.webp',
    'assets/sprites/courier-sheet.webp',
    'assets/sprites/world-sheet.webp',
  ])
})

test('delayed art cannot block the playable shell', async ({ page, artifactServer }) => {
  await page.route('**/assets/**/*.webp', async route => {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 450))
    await route.continue()
  })
  await page.goto(artifactServer.origin)
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  await expect(page.getByRole('button', { name: 'jump' })).toBeEnabled()
})
