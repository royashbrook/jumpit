import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const REQUIRED_SHELL = [
  './', './index.html', './app.css?v=8', './app.js?v=7', './audio.js', './daily.js',
  './game.js?v=5', './levels.js', './release.js', './save.js', './engine/physics.js',
  './engine/simulation.js', './version.js', './seed.js', './install.js', './update.js?v=4', './manifest.json',
  './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './assets/backgrounds/garden-walk.webp', './assets/backgrounds/region-atlas.webp',
  './assets/backgrounds/final-atlas.webp', './assets/sprites/courier-sheet.webp',
  './assets/sprites/world-sheet.webp', './assets/sprites/region-sheet.webp',
  './assets/sprites/final-sheet.webp',
]

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8')

const gitBlobId = bytes => createHash('sha1')
  .update(`blob ${bytes.length}\0`)
  .update(bytes)
  .digest('hex')

function installWith(addAll) {
  const listeners = {}
  let skipped = 0
  const sandbox = {
    self: {
      addEventListener: (name, listener) => { listeners[name] = listener },
      skipWaiting: async () => { skipped += 1 },
      clients: { claim: async () => {} },
      location: { origin: 'https://example.test' },
    },
    caches: { open: async () => ({ addAll }) },
    URL,
  }
  vm.runInNewContext(source, sandbox)
  let done
  listeners.install({ waitUntil: promise => { done = promise } })
  return { done, skipped: () => skipped }
}

test('the worker precaches every required shell entry before it can activate', async () => {
  let received
  const install = installWith(async entries => { received = [...entries] })
  await install.done
  assert.deepEqual(received, REQUIRED_SHELL)
  assert.equal(install.skipped(), 1)
})

test('one failed shell entry rejects installation and never calls skipWaiting', async () => {
  const install = installWith(async entries => {
    assert.deepEqual([...entries], REQUIRED_SHELL)
    throw new Error('required shell entry failed')
  })
  await assert.rejects(install.done, /required shell entry failed/)
  assert.equal(install.skipped(), 0)
})

test('migration fixtures are byte-for-byte shipped and preview clients', async () => {
  const fixtures = [
    ['v1.5', '6aeef5886fd93e86fce0df9e5f736284d6136e66', '640c09cff6ced479dce12f70daa4147f1d97cd2d'],
    ['v1.7', 'cd89bbe2545e463e82269012fc0c6d5aefcabacc', '6b325b24741f7e9becef5cb138a0f50f55d256da'],
    ['v1.8', 'd8ac9ef32bc8bfe0b20fc35cf2e879830a9db4b3', '6b325b24741f7e9becef5cb138a0f50f55d256da'],
    ['v1.9', 'f19f86bde0c64b7e3f1b660915951730112a9d41', '6b325b24741f7e9becef5cb138a0f50f55d256da'],
    ['v2.0-preview', '8c5ed7906916992030404b6cee0db6d354b28b7a', '6b325b24741f7e9becef5cb138a0f50f55d256da'],
  ]
  for (const [version, workerHash, updaterHash] of fixtures) {
    const worker = await readFile(new URL(`./fixtures/${version}/sw.js`, import.meta.url))
    const updater = await readFile(new URL(`./fixtures/${version}/update.js`, import.meta.url))
    assert.equal(gitBlobId(worker), workerHash)
    assert.equal(gitBlobId(updater), updaterHash)
  }
})

function activateWith(keys, clients = []) {
  const listeners = {}
  const deleted = []
  const navigated = []
  let claims = 0
  let matches = 0
  const sandbox = {
    self: {
      addEventListener: (name, listener) => { listeners[name] = listener },
      skipWaiting: async () => {},
      clients: {
        claim: async () => { claims += 1 },
        matchAll: async options => {
          matches += 1
          assert.deepEqual({ ...options }, { type: 'window', includeUncontrolled: true })
          return clients.map(url => ({
            url,
            navigate: target => {
              navigated.push(target)
              return {
                catch: () => {},
                then: () => assert.fail('activation must not await client navigation'),
              }
            },
          }))
        },
      },
      location: { origin: 'https://example.test' },
      registration: { scope: 'https://example.test/jumpit/' },
    },
    caches: {
      keys: async () => keys,
      delete: async key => { deleted.push(key) },
    },
    URL,
  }
  vm.runInNewContext(source, sandbox)
  let done
  listeners.activate({ waitUntil: promise => { done = promise } })
  return { done, deleted, navigated, claims: () => claims, matches: () => matches }
}

test('activation migrates v1.5 clients in scope after the complete B cache wins', async () => {
  const activation = activateWith(
    ['jumpit-v1.5.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0', 'jumpit-v2.0.0-r2', 'jumpit-v2.0.0-r3', 'jumpit-v2.0.0-r4', 'jumpit-v2.0.0-r5', 'jumpit-v2.0.0-r6', 'jumpit-v2.0.0-r7', 'jumpit-v2.0.0-r8', 'sibling-game-v4'],
    [
      'https://example.test/jumpit/?seed=7',
      'https://example.test/other-game/',
      'https://elsewhere.test/jumpit/',
    ],
  )
  await activation.done
  assert.deepEqual(activation.deleted, ['jumpit-v1.5.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0', 'jumpit-v2.0.0-r2', 'jumpit-v2.0.0-r3', 'jumpit-v2.0.0-r4', 'jumpit-v2.0.0-r5', 'jumpit-v2.0.0-r6', 'jumpit-v2.0.0-r7'])
  assert.equal(activation.claims(), 1)
  assert.equal(activation.matches(), 1)
  assert.deepEqual(activation.navigated, ['https://example.test/jumpit/?seed=7'])
})

test('activation without the v1.5 cache claims but never forces a navigation', async () => {
  const activation = activateWith(['jumpit-v1.8.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0', 'jumpit-v2.0.0-r2', 'jumpit-v2.0.0-r3', 'jumpit-v2.0.0-r4', 'jumpit-v2.0.0-r5', 'jumpit-v2.0.0-r6', 'jumpit-v2.0.0-r7', 'jumpit-v2.0.0-r8'], [
    'https://example.test/jumpit/',
  ])
  await activation.done
  assert.deepEqual(activation.deleted, ['jumpit-v1.8.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0', 'jumpit-v2.0.0-r2', 'jumpit-v2.0.0-r3', 'jumpit-v2.0.0-r4', 'jumpit-v2.0.0-r5', 'jumpit-v2.0.0-r6', 'jumpit-v2.0.0-r7'])
  assert.equal(activation.claims(), 1)
  assert.equal(activation.matches(), 0)
  assert.deepEqual(activation.navigated, [])
})

function dispatchFetch(request, {
  match,
  fetch,
  open = async () => ({ put: async () => {} }),
  waitUntil = () => {},
}) {
  const listeners = {}
  const sandbox = {
    self: {
      addEventListener: (name, listener) => { listeners[name] = listener },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      location: { origin: 'https://example.test' },
    },
    caches: { match, open },
    fetch,
    URL,
  }
  vm.runInNewContext(source, sandbox)
  let response
  listeners.fetch({
    request,
    respondWith: promise => { response = promise },
    waitUntil,
  })
  return response
}

test('the real worker serves cached navigation or its shell fallback when the network is offline', async () => {
  const request = { method: 'GET', mode: 'navigate', url: 'https://example.test/jumpit/deep-link' }
  const cachedRequest = { id: 'cached-request' }
  const cachedShell = { id: 'cached-index' }

  assert.equal(await dispatchFetch(request, {
    fetch: async () => { throw new Error('offline') },
    match: async key => key === request ? cachedRequest : null,
  }), cachedRequest)

  const lookups = []
  assert.equal(await dispatchFetch(request, {
    fetch: async () => { throw new Error('offline') },
    match: async key => {
      lookups.push(key)
      return key === './index.html' ? cachedShell : null
    },
  }), cachedShell)
  assert.deepEqual(lookups, [request, './index.html'])
})

test('the real worker serves a cached asset without touching the network', async () => {
  const request = {
    method: 'GET',
    mode: 'same-origin',
    url: 'https://example.test/assets/sprites/courier-sheet.webp',
  }
  const cachedAsset = { id: 'cached-art' }
  let network = 0
  const response = await dispatchFetch(request, {
    fetch: async () => { network += 1; throw new Error('network must stay unused') },
    match: async key => key === request ? cachedAsset : null,
  })
  assert.equal(response, cachedAsset)
  assert.equal(network, 0)
})

test('a successful network navigation never rewrites the immutable active cache', async () => {
  const request = { method: 'GET', mode: 'navigate', url: 'https://example.test/jumpit/' }
  const networkResponse = { ok: true, id: 'newer-html' }
  networkResponse.clone = () => networkResponse
  let opens = 0
  let waits = 0
  const response = await dispatchFetch(request, {
    fetch: async () => networkResponse,
    match: async () => assert.fail('online navigation must stay network-first'),
    open: async () => { opens += 1; return { put: async () => {} } },
    waitUntil: () => { waits += 1 },
  })
  assert.equal(response, networkResponse)
  assert.equal(opens, 0)
  assert.equal(waits, 0)
})
