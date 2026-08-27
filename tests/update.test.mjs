import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const versionSource = await readFile(new URL('../version.js', import.meta.url), 'utf8')
const currentVersion = versionSource.match(/VERSION\s*=\s*['"]([^'"]+)/)?.[1]

class Target {
  constructor() { this.listeners = new Map() }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }
  async emit(name, event = {}) {
    for (const listener of this.listeners.get(name) || []) await listener(event)
  }
}

async function withUpdate(run) {
  const saved = Object.getOwnPropertyDescriptors(globalThis)
  const document = new Target()
  document.hidden = false
  document.readyState = 'complete'
  const serviceWorker = new Target()
  serviceWorker.controller = { scriptURL: 'https://example.test/sw.js' }
  let reloads = 0
  let updates = 0
  const registration = { update: async () => { updates += 1 } }
  serviceWorker.register = async () => registration
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    navigator: { configurable: true, value: { serviceWorker } },
    location: { configurable: true, value: { protocol: 'https:', reload: () => { reloads += 1 } } },
    addEventListener: { configurable: true, value: () => {} },
    setInterval: { configurable: true, value: () => 1 },
  })
  try {
    const module = await import(`../update.js?test=${Math.random()}`)
    await run({ ...module, document, serviceWorker, reloads: () => reloads, updates: () => updates })
  } finally {
    for (const key of ['document', 'navigator', 'location', 'addEventListener', 'setInterval', 'fetch']) {
      const descriptor = saved[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('the update probe compares the deployed version with the loaded shell version', async () => {
  await withUpdate(async ({ wireUpdate }) => {
    const banner = new Target()
    banner.hidden = true
    let deployed = currentVersion
    globalThis.fetch = async (url, options) => {
      assert.equal(url, './version.js?update-probe')
      assert.equal(options.cache, 'no-store')
      return { ok: true, text: async () => `export const VERSION = '${deployed}'` }
    }
    const update = wireUpdate(banner)
    assert.equal(await update.check(), 'current')
    assert.equal(banner.hidden, true)
    deployed = '999.0.0'
    assert.equal(await update.check(), 'stale')
    assert.equal(banner.hidden, false)
  })
})

test('a replacement controller and the banner can trigger only one reload', async () => {
  await withUpdate(async ({ wireUpdate, registerWorker, document, serviceWorker, reloads, updates }) => {
    globalThis.fetch = async () => ({ ok: true, text: async () => versionSource })
    const banner = new Target()
    banner.hidden = true
    wireUpdate(banner)
    await registerWorker()
    assert.equal(updates(), 1)
    await document.emit('visibilitychange')
    assert.equal(updates(), 2)
    await serviceWorker.emit('controllerchange')
    await serviceWorker.emit('controllerchange')
    await banner.emit('click')
    assert.equal(reloads(), 1)
  })
})

test('first installation claims the page without an update reload', async () => {
  await withUpdate(async ({ registerWorker, serviceWorker, reloads }) => {
    serviceWorker.controller = null
    await registerWorker()
    await serviceWorker.emit('controllerchange')
    assert.equal(reloads(), 0)
  })
})
