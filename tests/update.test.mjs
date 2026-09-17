import assert from 'node:assert/strict'
import test from 'node:test'

class Target {
  constructor() { this.listeners = new Map() }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || []
    listeners.push(listener)
    this.listeners.set(name, listeners)
  }
  removeEventListener(name, listener) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== listener))
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
      this.port1 = { onmessage: null, close() {} }
      this.port2 = { postMessage: data => this.port1.onmessage?.({ data }), close() {} }
    }
  }
  const controller = {
    scriptURL: 'https://example.test/sw.js',
    postMessage: (message, ports) => { if (message === 'jumpit:generation') ports[0].postMessage(workerGeneration) },
  }
  serviceWorker.controller = controller
  let reloads = 0
  let updates = 0
  const intervals = []
  const cleared = []
  const windowTarget = new Target()
  const registration = { update: async () => { updates += 1 } }
  serviceWorker.register = async () => registration
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    navigator: { configurable: true, value: { serviceWorker } },
    location: { configurable: true, value: { protocol: 'https:', href: 'https://example.test/', reload: () => { reloads += 1 } } },
    fetch: { configurable: true, writable: true, value: async () => { throw new Error('offline') } },
    addEventListener: { configurable: true, value: windowTarget.addEventListener.bind(windowTarget) },
    removeEventListener: { configurable: true, value: windowTarget.removeEventListener.bind(windowTarget) },
    MessageChannel: { configurable: true, value: TestMessageChannel },
    setInterval: { configurable: true, value: (callback, delay) => intervals.push({ callback, delay }) },
    clearInterval: { configurable: true, value: id => cleared.push(id) },
  })
  try {
    const module = await import(`../src/update.ts?test=${Math.random()}`)
    workerGeneration = module.GENERATION
    await run({
      ...module,
      controller,
      document,
      intervals,
      cleared,
      windowTarget,
      serviceWorker,
      setGeneration: value => { workerGeneration = value },
      reloads: () => reloads,
      updates: () => updates,
    })
  } finally {
    for (const key of ['document', 'navigator', 'location', 'addEventListener', 'removeEventListener', 'MessageChannel', 'setInterval', 'clearInterval', 'fetch']) {
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
    await registerWorker('sw.js', update.reveal).ready
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
    await registerWorker('sw.js', update.reveal).ready
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

test('disposal detaches update controls, refresh listeners and intervals', async () => {
  await withUpdate(async ({ wireUpdate, registerWorker, serviceWorker, document, cleared, setGeneration, GENERATION, reloads, updates }) => {
    const banner = new Target()
    banner.hidden = true
    const update = wireUpdate(banner)
    const worker = registerWorker('sw.js', update.reveal)
    await worker.ready
    assert.equal(updates(), 1)
    worker.dispose()
    update.dispose()
    setGeneration(`${GENERATION}-new`)
    await serviceWorker.emit('controllerchange')
    await document.emit('visibilitychange')
    await banner.emit('click')
    assert.equal(banner.hidden, true)
    assert.equal(update.reveal(), false)
    assert.equal(reloads(), 0)
    assert.equal(updates(), 1)
    assert.deepEqual(cleared, [1])
    assert.equal(serviceWorker.listeners.get('controllerchange').length, 0)
    assert.equal(document.listeners.get('visibilitychange').length, 0)
    assert.equal(banner.listeners.get('click').length, 0)
  })
})

test('disposal before window load prevents late registration', async () => {
  await withUpdate(async ({ registerWorker, document, serviceWorker, windowTarget }) => {
    document.readyState = 'loading'
    let registrations = 0
    serviceWorker.register = async () => { registrations++; return { update: async () => {} } }
    const worker = registerWorker()
    worker.dispose()
    await windowTarget.emit('load')
    assert.equal(await worker.ready, null)
    assert.equal(registrations, 0)
  })
})

test('disposal during registration prevents late refresh subscriptions', async () => {
  await withUpdate(async ({ registerWorker, serviceWorker, document, intervals }) => {
    let finish
    serviceWorker.register = () => new Promise(resolve => { finish = resolve })
    const worker = registerWorker()
    worker.dispose()
    finish({ update: async () => assert.fail('disposed registration refreshed') })
    await Promise.resolve()
    assert.equal(await worker.ready, null)
    assert.equal(intervals.length, 0)
    assert.equal((document.listeners.get('visibilitychange') || []).length, 0)
  })
})

test('a new page under an old controller does not advertise a backward update', async () => {
  await withUpdate(async ({ registerWorker, setGeneration }) => {
    setGeneration('jumpit-v2.0.0-r23')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ build: 'development' }) })
    let reveals = 0
    const worker = registerWorker('sw.js', () => { reveals++ })
    await worker.ready
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reveals, 0)
    worker.dispose()
  })
})

test('an already newer controller is announced only when the origin confirms that generation', async () => {
  await withUpdate(async ({ registerWorker, setGeneration }) => {
    setGeneration('jumpit-112233445566')
    globalThis.fetch = async (url, options) => {
      assert.equal(url.href, 'https://example.test/version.json?update-probe')
      assert.equal(options.cache, 'no-store')
      assert.ok(options.signal instanceof AbortSignal)
      return { ok: true, json: async () => ({ build: '112233445566' }) }
    }
    let reveals = 0
    const worker = registerWorker('sw.js', () => { reveals++ })
    await worker.ready
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reveals, 1)
    worker.dispose()
  })
})

test('disposing during the startup probe aborts it and ignores its late result', async () => {
  await withUpdate(async ({ registerWorker, setGeneration }) => {
    setGeneration('jumpit-112233445566')
    let finish, signal
    globalThis.fetch = async (_url, options) => {
      signal = options.signal
      return new Promise(resolve => { finish = resolve })
    }
    let reveals = 0
    const worker = registerWorker('sw.js', () => { reveals++ })
    await worker.ready
    worker.dispose()
    assert.equal(signal.aborted, true)
    finish({ ok: true, json: async () => ({ build: '112233445566' }) })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(reveals, 0)
  })
})
