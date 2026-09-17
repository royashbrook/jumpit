import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const build = new URL('../build/', import.meta.url)
const source = await readFile(new URL('sw.js', build), 'utf8')
const identity = JSON.parse(await readFile(new URL('version.json', build), 'utf8'))
const generation = `jumpit-${identity.build}`
const scope = 'https://example.test/jumpit/'
const oldGenerations = [
  'jumpit-v0.9.0', 'jumpit-v1.5.0', 'jumpit-v1.7.0', 'jumpit-v1.8.0', 'jumpit-v1.9.0', 'jumpit-v2.0.0',
  ...Array.from({ length: 23 }, (_, index) => `jumpit-v2.0.0-r${index + 1}`),
]

async function builtPaths(directory = build, prefix = '') {
  const paths = await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => {
    const path = `${prefix}${entry.name}`
    return entry.isDirectory() ? builtPaths(new URL(`${entry.name}/`, directory), `${path}/`) : path
  }))
  return paths.flat().sort()
}

const requiredShell = ['./', ...(await builtPaths()).filter(path => !['sw.js', '_headers'].includes(path)).map(path => `./${path}`)]
const gitBlobId = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const request = (path = './', mode = 'navigate', method = 'GET') => ({ url: new URL(path, scope).href, mode, method })

function workerWith({
  keys = [generation], clients = [], registration = {},
  addAll = async () => {}, currentMatch = async () => undefined,
  previousMatch = async () => undefined, fetch = async () => { throw new Error('offline') },
} = {}) {
  const listeners = {}
  const remaining = new Set(keys)
  const state = { opened: [], deleted: [], navigated: [], entries: [], claims: 0, skips: 0, matches: 0, network: 0 }
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, listener) => { listeners[name] = listener },
      skipWaiting: async () => { state.skips += 1 },
      location: { origin: new URL(scope).origin },
      registration: { scope, installing: null, waiting: null, ...registration },
      clients: {
        claim: async () => { state.claims += 1 },
        matchAll: async options => {
          state.matches += 1
          assert.deepEqual({ ...options }, { type: 'window', includeUncontrolled: true })
          return clients.map(client => ({
            navigate: target => {
              state.navigated.push(target)
              // Browser navigation waits for activation. Awaiting it here would deadlock.
              return { catch: () => {}, then: () => assert.fail('activation must not await navigation') }
            },
            ...client,
          }))
        },
      },
    },
    caches: {
      open: async name => {
        state.opened.push(name)
        assert.equal(name, generation, 'a candidate must never modify an installed generation')
        return {
          addAll: async entries => { state.entries.push([...entries]); await addAll(entries) },
          match: currentMatch,
          put: () => assert.fail('installed caches are immutable'),
        }
      },
      match: previousMatch,
      keys: async () => [...remaining],
      delete: async name => { state.deleted.push(name); return remaining.delete(name) },
    },
    fetch: async value => { state.network += 1; return fetch(value) },
    URL,
    Response,
  })
  return {
    state,
    async dispatch(name, payload = {}) {
      const pending = []
      listeners[name]({ ports: [], ...payload, waitUntil: promise => { pending.push(promise) } })
      await Promise.all(pending)
    },
    fetch(value) {
      let response
      listeners.fetch({ request: value, respondWith: promise => { response = promise } })
      return response
    },
  }
}

test('the emitted worker precaches every built path before requesting activation', async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  const worker = workerWith({ addAll: () => pending })
  const installed = worker.dispatch('install')
  await Promise.resolve()
  assert.deepEqual(worker.state.entries, [requiredShell])
  assert.equal(worker.state.skips, 0)
  finish()
  await installed
  assert.deepEqual(worker.state.opened, [generation])
  assert.equal(worker.state.skips, 1)
  assert.ok(requiredShell.includes('./index.html'))
  assert.ok(requiredShell.some(path => /^\.\/assets\/.+\.js$/.test(path)))
  assert.ok(requiredShell.some(path => /^\.\/assets\/.+\.css$/.test(path)))
})

test('a failed precache cannot activate or touch any installed generation', async () => {
  const worker = workerWith({
    keys: [...oldGenerations, 'sibling-game-v4'],
    addAll: async entries => {
      assert.deepEqual([...entries], requiredShell)
      throw new Error('required shell entry failed')
    },
  })
  await assert.rejects(worker.dispatch('install'), /required shell entry failed/)
  assert.deepEqual(worker.state.opened, [generation])
  assert.deepEqual(worker.state.deleted, [])
  assert.equal(worker.state.skips, 0)
  assert.equal(worker.state.claims, 0)
})

test('the legacy generation protocol returns the exact emitted build identity', async () => {
  const worker = workerWith()
  let received
  await worker.dispatch('message', { data: 'jumpit:generation', ports: [{ postMessage: value => { received = value } }] })
  assert.equal(received, generation)
  await worker.dispatch('message', { data: 'jumpit:generation' })
  assert.equal(worker.state.matches, 0)
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

test('the exact v1.5 marker bridges scoped clients once without awaiting their navigation', async () => {
  const worker = workerWith({
    keys: [generation, ...oldGenerations, 'sibling-game-v4'],
    clients: [
      { id: 'game', url: `${scope}?seed=7` },
      { id: 'sibling', url: 'https://example.test/other-game/' },
      { id: 'prefix', url: 'https://example.test/jumpit-other/' },
      { id: 'other-origin', url: 'https://elsewhere.test/jumpit/' },
    ],
  })
  await worker.dispatch('activate')
  assert.deepEqual(worker.state.deleted, ['jumpit-v1.5.0'])
  assert.deepEqual(worker.state.navigated, [`${scope}?seed=7`])
  assert.equal(worker.state.claims, 1)
  await worker.dispatch('activate')
  assert.deepEqual(worker.state.deleted, ['jumpit-v1.5.0'])
  assert.deepEqual(worker.state.navigated, [`${scope}?seed=7`])
  assert.equal(worker.state.claims, 2)
  assert.equal(worker.state.matches, 1)
})

test('activation without the exact v1.5 marker preserves old caches and never reloads clients', async () => {
  const worker = workerWith({
    keys: [generation, ...oldGenerations.filter(key => key !== 'jumpit-v1.5.0'), 'jumpit-v1.5.0-preview'],
    clients: [{ id: 'game', url: scope }],
  })
  await worker.dispatch('activate')
  assert.deepEqual(worker.state.deleted, [])
  assert.deepEqual(worker.state.navigated, [])
  assert.equal(worker.state.claims, 1)
  assert.equal(worker.state.matches, 0)
})

test('only the sole scoped owner acknowledging the current generation retires old Jumpit caches', async () => {
  const owner = { id: 'current', url: scope }
  const worker = workerWith({ keys: [generation, ...oldGenerations, 'sibling-game-v4'], clients: [owner] })
  await worker.dispatch('message', { data: { type: 'CLIENT_GENERATION', generation }, source: owner })
  assert.deepEqual(worker.state.deleted, oldGenerations)
  assert.deepEqual(worker.state.navigated, [])
})

test('unsafe cleanup acknowledgments retain every installed generation', async t => {
  const owner = { id: 'current', url: scope }
  const cases = [
    { name: 'wrong generation', data: { type: 'CLIENT_GENERATION', generation: 'jumpit-stale' } },
    { name: 'wrong message', data: { type: 'UNKNOWN', generation } },
    { name: 'missing generation', data: { type: 'CLIENT_GENERATION' } },
    { name: 'no source', source: null },
    { name: 'source without an id', source: {} },
    { name: 'different owner', source: { id: 'other', url: scope } },
    { name: 'no clients', clients: [] },
    { name: 'another open old tab', clients: [owner, { id: 'old', url: `${scope}?seed=7` }] },
    { name: 'installing candidate', registration: { installing: {} } },
    { name: 'waiting candidate', registration: { waiting: {} } },
    { name: 'sole client outside scope', clients: [{ id: 'current', url: 'https://example.test/other-game/' }], source: { id: 'current', url: 'https://example.test/other-game/' } },
  ]
  for (const scenario of cases) await t.test(scenario.name, async () => {
    const worker = workerWith({ keys: [generation, ...oldGenerations], clients: [owner], ...scenario })
    await worker.dispatch('message', { data: { type: 'CLIENT_GENERATION', generation }, source: owner, ...scenario })
    assert.deepEqual(worker.state.deleted, [])
  })
})

test('installed root, index and seed navigation use the immutable current shell before network', async () => {
  for (const path of ['./', './?seed=7', './index.html', './index.html?seed=7']) {
    const cached = new Response('installed shell')
    const worker = workerWith({ currentMatch: async key => key === scope ? cached : undefined })
    assert.equal(await worker.fetch(request(path)), cached)
    assert.equal(worker.state.network, 0)
  }
})

test('a known cached document is served exactly, but unknown offline navigation is not a fake game page', async () => {
  const documentRequest = request('./licenses.md')
  const document = new Response('license text')
  const shell = new Response('game shell')
  const worker = workerWith({ currentMatch: async key => key === documentRequest ? document : key === scope ? shell : undefined })
  assert.equal(await worker.fetch(documentRequest), document)
  // Intentional change from the old generic index fallback: there is no pathname router.
  assert.equal((await worker.fetch(request('./deep-link'))).type, 'error')
  assert.equal((await worker.fetch(request('./unknown-license.md'))).type, 'error')
})

test('redirected cached navigation is reconstructed into an offline-safe response', async () => {
  const cached = new Response('redirected shell', { status: 200, statusText: 'OK', headers: { 'content-type': 'text/html', 'x-build': identity.build } })
  Object.defineProperty(cached, 'redirected', { value: true })
  const worker = workerWith({ currentMatch: async () => cached })
  const response = await worker.fetch(request())
  assert.notEqual(response, cached)
  assert.equal(response.redirected, false)
  assert.equal(response.status, cached.status)
  assert.equal(response.statusText, cached.statusText)
  assert.equal(response.headers.get('x-build'), identity.build)
  assert.equal(response.headers.get('content-type'), 'text/html')
  assert.equal(await response.text(), 'redirected shell')
  assert.equal(worker.state.network, 0)
})

test('current assets and held old hashed modules remain available without network', async () => {
  const asset = request('./assets/sprites/courier-sheet.webp', 'same-origin')
  const cached = new Response('art')
  const current = workerWith({ currentMatch: async key => key === asset ? cached : undefined })
  assert.equal(await current.fetch(asset), cached)
  assert.equal(current.state.network, 0)
  const oldModule = request('./assets/app-previoushash.js', 'same-origin')
  const previous = new Response('old module')
  const held = workerWith({ previousMatch: async key => key === oldModule ? previous : undefined })
  assert.equal(await held.fetch(oldModule), previous)
  assert.equal(held.state.network, 0)
})

test('network misses never write into the immutable installed cache', async () => {
  for (const mode of ['navigate', 'same-origin']) {
    const networkResponse = new Response('network content')
    const worker = workerWith({ fetch: async () => networkResponse })
    assert.equal(await worker.fetch(request('./uncached', mode)), networkResponse)
    assert.equal(worker.state.network, 1)
    assert.deepEqual(worker.state.entries, [])
    assert.deepEqual(worker.state.deleted, [])
  }
  const worker = workerWith()
  assert.equal((await worker.fetch(request('./missing.png', 'same-origin'))).type, 'error')
})

test('update probes, non-GET requests and cross-origin requests bypass the worker cache', () => {
  const worker = workerWith()
  for (const value of [
    request('./version.js?update-probe=1', 'same-origin'),
    request('./?seed=7&update-probe', 'navigate'),
    request('./', 'same-origin', 'POST'),
    request('https://elsewhere.test/jumpit/', 'same-origin'),
  ]) assert.equal(worker.fetch(value), undefined)
  assert.deepEqual(worker.state.opened, [])
  assert.equal(worker.state.network, 0)
})
