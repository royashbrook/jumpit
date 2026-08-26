import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from 'playwright/test'

const releaseRoot = resolve(process.cwd(), process.env.JUMPIT_ROOT || '.')
const workerSource = await readFile(resolve(releaseRoot, 'sw.js'), 'utf8')
const updateSource = await readFile(resolve(releaseRoot, 'update.js'), 'utf8')
const versionSource = await readFile(resolve(releaseRoot, 'version.js'), 'utf8')
const legacyWorkerSource = await readFile(new URL('../fixtures/v1.5/sw.js', import.meta.url), 'utf8')
const legacyUpdateSource = await readFile(new URL('../fixtures/v1.5/update.js', import.meta.url), 'utf8')
const previousWorkerSource = await readFile(new URL('../fixtures/v1.8/sw.js', import.meta.url), 'utf8')
const previousUpdateSource = await readFile(new URL('../fixtures/v1.8/update.js', import.meta.url), 'utf8')
const previousVersion = '1.8.0'
const currentVersion = versionSource.match(/VERSION\s*=\s*['"]([^'"]+)/)?.[1]
const nextVersion = '2.0.0'
const REQUIRED_SHELL = [
  './', './index.html', './app.css', './app.js', './audio.js', './daily.js',
  './game.js', './levels.js', './release.js', './save.js', './engine/physics.js',
  './engine/simulation.js', './version.js', './seed.js', './install.js', './update.js', './manifest.json',
  './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './assets/backgrounds/garden-walk.webp', './assets/backgrounds/region-atlas.webp',
  './assets/backgrounds/final-atlas.webp', './assets/sprites/courier-sheet.webp',
  './assets/sprites/world-sheet.webp', './assets/sprites/region-sheet.webp',
  './assets/sprites/final-sheet.webp',
]
const ART_ASSETS = [
  { file: './assets/backgrounds/garden-walk.webp', width: 1774, height: 887, alpha: false },
  { file: './assets/backgrounds/region-atlas.webp', width: 1536, height: 1024, alpha: false },
  { file: './assets/backgrounds/final-atlas.webp', width: 1536, height: 1024, alpha: false },
  { file: './assets/sprites/courier-sheet.webp', width: 768, height: 512, alpha: true },
  { file: './assets/sprites/world-sheet.webp', width: 768, height: 512, alpha: true },
  { file: './assets/sprites/region-sheet.webp', width: 768, height: 512, alpha: true },
  { file: './assets/sprites/final-sheet.webp', width: 768, height: 512, alpha: true },
]

async function startVersionServer(initial = '1.5.0') {
  let release = initial
  let failedPath = null
  const navigations = []
  const probes = []
  const failures = []
  const shell = () => `<!doctype html>
    <html data-release="boot"><head><meta name="build" content="${release}"></head>
    <body><button id="update" hidden>update</button><script type="module">
      import { VERSION } from './version.js'
      import { wireUpdate, registerWorker } from './update.js'
      document.documentElement.dataset.release = VERSION
      wireUpdate(document.querySelector('#update'))
      registerWorker()
    </script></body></html>`
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://local.test')
    const path = url.pathname
    const headers = { 'cache-control': 'no-store' }
    if (path === '/' || path === '/index.html') {
      if (request.headers['sec-fetch-mode'] === 'navigate') navigations.push(release)
      if (url.searchParams.has('update-probe')) probes.push(release)
      response.writeHead(200, { ...headers, 'content-type': 'text/html' }).end(shell())
      return
    }
    if (path === '/sw.js') {
      const worker = release === '1.5.0'
        ? legacyWorkerSource
        : release === previousVersion
          ? previousWorkerSource
        : release === currentVersion
          ? workerSource
          : workerSource.replace("'jumpit-v1.9.0'", `'jumpit-v${release}'`)
      response.writeHead(200, { ...headers, 'content-type': 'text/javascript' }).end(worker)
      return
    }
    if (path === '/update.js') {
      const updater = release === '1.5.0'
        ? legacyUpdateSource
        : release === previousVersion
          ? previousUpdateSource
          : updateSource
      response.writeHead(200, { ...headers, 'content-type': 'text/javascript' }).end(updater)
      return
    }
    if (path === '/version.js') {
      response.writeHead(200, { ...headers, 'content-type': 'text/javascript' })
        .end(`export const VERSION = '${release}'`)
      return
    }
    if (path === '/manifest.json') {
      response.writeHead(200, { ...headers, 'content-type': 'application/json' })
        .end(JSON.stringify({ id: './', start_url: './', scope: './' }))
      return
    }
    if (path === failedPath) {
      failures.push({ path, release })
      response.writeHead(404, headers).end('required shell entry missing')
      return
    }
    if (path.endsWith('.png') || path.endsWith('.webp')) {
      response.writeHead(200, { ...headers, 'content-type': path.endsWith('.webp') ? 'image/webp' : 'image/png' }).end(release)
      return
    }
    if (path.endsWith('.css')) {
      response.writeHead(200, { ...headers, 'content-type': 'text/css' }).end(`/* release-${release} */`)
      return
    }
    if (path.endsWith('.js')) {
      response.writeHead(200, { ...headers, 'content-type': 'text/javascript' })
        .end(`export const BUILD = '${release}'`)
      return
    }
    response.writeHead(404).end('not found')
  })
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
  const { port } = server.address()
  return {
    origin: `http://127.0.0.1:${port}/`,
    navigations,
    probes,
    failures,
    use: next => { release = next },
    fail: path => { failedPath = path },
    close: () => new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())),
  }
}

test('the installed shell is controlled with a complete precache; Chromium also reloads offline', async ({ page, context, browserName }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  const proof = await page.evaluate(async ({ cacheName, required }) => {
    const cache = await caches.open(cacheName)
    const missing = []
    for (const url of required) if (!await cache.match(url)) missing.push(url)
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      caches: (await globalThis.caches.keys()).filter(name => name.startsWith('jumpit-')),
      missing,
    }
  }, { cacheName: 'jumpit-v1.9.0', required: REQUIRED_SHELL })
  expect(proof).toEqual({ controlled: true, caches: ['jumpit-v1.9.0'], missing: [] })

  // Playwright WebKit cannot reliably force network loss. The worker-event oracle
  // proves its fallback branches; an actual iPhone offline receipt remains a v2 gate.
  if (browserName === 'webkit') return
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  const offline = await page.evaluate(async required => {
    const failed = []
    for (const url of required) {
      try {
        if (!(await fetch(url)).ok) failed.push(url)
      } catch {
        failed.push(url)
      }
    }
    return failed
  }, REQUIRED_SHELL)
  expect(offline).toEqual([])
  await context.setOffline(false)
})

test('every shipped WebP has the right MIME, decodes, and preserves sprite alpha', async ({ page }) => {
  await page.goto('/')
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

test('the exact shipped v1.5 client migrates once into a coherent current shell', async ({ page, context, browserName }) => {
  const server = await startVersionServer()
  try {
    await page.goto(server.origin, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-release', '1.5.0')
    await expect.poll(() => server.probes.filter(release => release === '1.5.0').length).toBeGreaterThan(0)
    const before = server.navigations.length

    server.use(currentVersion)
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    await expect.poll(() => server.navigations.filter(release => release === currentVersion).length).toBe(1)
    expect(server.navigations.length).toBe(before + 1)

    const proof = await page.evaluate(async () => {
      const cacheNames = (await caches.keys()).filter(name => name.startsWith('jumpit-'))
      const index = await caches.match('./index.html')
      const version = await caches.match('./version.js')
      const app = await caches.match('./app.js')
      return {
        cacheNames,
        index: await index.text(),
        version: await version.text(),
        app: await app.text(),
      }
    })
    expect(proof.cacheNames).toEqual(['jumpit-v1.9.0'])
    expect(proof.index).toContain(`content="${currentVersion}"`)
    expect(proof.version).toContain(`VERSION = '${currentVersion}'`)
    expect(proof.app).toContain(`BUILD = '${currentVersion}'`)

    if (browserName === 'webkit') return
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    expect(server.navigations.filter(release => release === currentVersion)).toHaveLength(1)
    await context.setOffline(false)
  } finally {
    await context.setOffline(false).catch(() => {})
    await server.close()
  }
})

test('the exact shipped v1.8 client upgrades once into a coherent current shell', async ({ page, context, browserName }) => {
  const server = await startVersionServer(previousVersion)
  try {
    await page.goto(server.origin, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-release', previousVersion)
    const before = server.navigations.length

    server.use(currentVersion)
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    await expect.poll(() => server.navigations.filter(release => release === currentVersion).length).toBe(1)
    expect(server.navigations.length).toBe(before + 1)

    const proof = await page.evaluate(async () => {
      const cacheNames = (await caches.keys()).filter(name => name.startsWith('jumpit-'))
      const index = await caches.match('./index.html')
      const version = await caches.match('./version.js')
      const app = await caches.match('./app.js')
      return {
        cacheNames,
        index: await index.text(),
        version: await version.text(),
        app: await app.text(),
      }
    })
    expect(proof.cacheNames).toEqual(['jumpit-v1.9.0'])
    expect(proof.index).toContain(`content="${currentVersion}"`)
    expect(proof.version).toContain(`VERSION = '${currentVersion}'`)
    expect(proof.app).toContain(`BUILD = '${currentVersion}'`)

    // Playwright WebKit cannot reliably force network loss. It still proves the
    // controllerchange reload and coherent-cache transition above.
    if (browserName === 'webkit') return
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    expect(server.navigations.filter(release => release === currentVersion)).toHaveLength(1)
    await context.setOffline(false)
  } finally {
    await context.setOffline(false).catch(() => {})
    await server.close()
  }
})

test('failed next precache cannot mutate the active shell; Chromium reloads that shell offline', async ({ page, context, browserName }) => {
  const server = await startVersionServer(currentVersion)
  try {
    await page.goto(server.origin, { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    const before = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName)
      const root = await cache.match('./')
      const index = await cache.match('./index.html')
      const app = await cache.match('./app.js')
      return { root: await root.text(), index: await index.text(), app: await app.text() }
    }, 'jumpit-v1.9.0')
    const navigationCount = server.navigations.length

    server.use(nextVersion)
    server.fail('/assets/sprites/final-sheet.webp')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', nextVersion)
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      try { await registration.update() } catch {}
    })
    await expect.poll(() => server.failures.filter(failure => failure.release === nextVersion).length).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return !registration.installing && !registration.waiting
    })).toBe(true)

    const after = await page.evaluate(async cacheName => {
      const cache = await caches.open(cacheName)
      const root = await cache.match('./')
      const index = await cache.match('./index.html')
      const app = await cache.match('./app.js')
      return { root: await root.text(), index: await index.text(), app: await app.text() }
    }, 'jumpit-v1.9.0')
    expect(after).toEqual(before)
    expect(server.navigations.filter(release => release === nextVersion)).toHaveLength(1)
    expect(server.navigations.length).toBe(navigationCount + 1)

    if (browserName === 'webkit') return
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', currentVersion)
    await expect(page.locator('html')).toHaveAttribute('data-release', currentVersion)
    const offlineApp = await page.evaluate(async () => (await fetch('./app.js')).text())
    expect(offlineApp).toContain(`BUILD = '${currentVersion}'`)
    expect(server.navigations.filter(release => release === nextVersion)).toHaveLength(1)
    await context.setOffline(false)
  } finally {
    await context.setOffline(false).catch(() => {})
    await server.close()
  }
})

test('the update probe is network-fresh and reveals the reload banner', async ({ page }) => {
  let body = versionSource
  let probes = 0
  await page.route('**/version.js?update-probe*', route => {
    probes += 1
    return route.fulfill({ status: 200, contentType: 'text/javascript', body })
  })
  await page.goto('/')
  await expect.poll(() => probes).toBeGreaterThan(0)
  body = `export const VERSION = '${currentVersion}-next'`
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('#update')).toBeVisible()
})

test('first play assigns only the three Garden canvas WebPs', async ({ page }) => {
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
  await page.goto('/')
  expect(await page.evaluate(() => window.__jumpitImageSources)).toEqual([])
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect.poll(() => page.evaluate(() => window.__jumpitImageSources)).toHaveLength(3)
  expect((await page.evaluate(() => window.__jumpitImageSources)).sort()).toEqual([
    'assets/backgrounds/garden-walk.webp',
    'assets/sprites/courier-sheet.webp',
    'assets/sprites/world-sheet.webp',
  ])
})

test('delayed art cannot block the playable shell', async ({ page }) => {
  await page.route('**/assets/**/*.webp', async route => {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 450))
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  await expect(page.getByRole('button', { name: 'jump' })).toBeEnabled()
})
