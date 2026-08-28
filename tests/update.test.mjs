import assert from 'node:assert/strict'
import test from 'node:test'

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
  let workerGeneration
  class TestMessageChannel {
    constructor() {
      this.port1 = { onmessage: null }
      this.port2 = { postMessage: data => this.port1.onmessage?.({ data }) }
    }
  }
  const controller = {
    scriptURL: 'https://example.test/sw.js',
    postMessage: (_message, ports) => ports[0].postMessage(workerGeneration),
  }
  serviceWorker.controller = controller
  let reloads = 0
  let updates = 0
  const intervals = []
  const registration = { update: async () => { updates += 1 } }
  serviceWorker.register = async () => registration
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    navigator: { configurable: true, value: { serviceWorker } },
    location: { configurable: true, value: { protocol: 'https:', reload: () => { reloads += 1 } } },
    addEventListener: { configurable: true, value: () => {} },
    MessageChannel: { configurable: true, value: TestMessageChannel },
    setInterval: { configurable: true, value: (callback, delay) => intervals.push({ callback, delay }) },
  })
  try {
    const module = await import(`../update.js?test=${Math.random()}`)
    workerGeneration = module.GENERATION
    await run({
      ...module,
      controller,
      document,
      intervals,
      serviceWorker,
      setGeneration: value => { workerGeneration = value },
      reloads: () => reloads,
      updates: () => updates,
    })
  } finally {
    for (const key of ['document', 'navigator', 'location', 'addEventListener', 'MessageChannel', 'setInterval', 'fetch']) {
      const descriptor = saved[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('the update toast is inert until a ready release arms it and reloads once', async () => {
  await withUpdate(async ({ wireUpdate, reloads }) => {
    const banner = new Target()
    banner.hidden = true
    const update = wireUpdate(banner)
    await banner.emit('click')
    assert.equal(reloads(), 0)
    assert.equal(banner.hidden, true)
    update.reveal()
    assert.equal(banner.hidden, false)
    await banner.emit('click')
    await banner.emit('click')
    assert.equal(reloads(), 1)
  })
})

test('only a fully activated newer generation reveals the sticky update toast', async () => {
  await withUpdate(async ({ GENERATION, wireUpdate, registerWorker, document, intervals, serviceWorker, setGeneration, reloads, updates }) => {
    const banner = new Target()
    banner.hidden = true
    const update = wireUpdate(banner)
    await registerWorker('sw.js', update.reveal)
    assert.equal(updates(), 1)
    assert.equal(intervals[0].delay, 300_000)
    await intervals[0].callback()
    assert.equal(updates(), 2)
    await document.emit('visibilitychange')
    assert.equal(updates(), 3)
    setGeneration(GENERATION)
    await serviceWorker.emit('controllerchange')
    assert.equal(banner.hidden, true)
    setGeneration(`${GENERATION}-next`)
    await serviceWorker.emit('controllerchange')
    assert.equal(banner.hidden, false)
    assert.equal(reloads(), 0)
  })
})

test('first installation claims the page without an update toast or reload', async () => {
  await withUpdate(async ({ GENERATION, wireUpdate, registerWorker, controller, serviceWorker, setGeneration, reloads }) => {
    serviceWorker.controller = null
    const banner = new Target()
    banner.hidden = true
    const update = wireUpdate(banner)
    await registerWorker('sw.js', update.reveal)
    serviceWorker.controller = controller
    setGeneration(`${GENERATION}-next`)
    await serviceWorker.emit('controllerchange')
    assert.equal(banner.hidden, true)
    assert.equal(reloads(), 0)
    await serviceWorker.emit('controllerchange')
    assert.equal(banner.hidden, false)
    assert.equal(reloads(), 0)
  })
})
