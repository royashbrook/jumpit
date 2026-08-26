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

class Button extends Target {
  hidden = false
  disabled = false
  async click() { await this.emit('click', { currentTarget: this }) }
}

async function withInstall({ ios = false, installed = false }, run) {
  const saved = Object.getOwnPropertyDescriptors(globalThis)
  const window = new Target()
  window.matchMedia = query => ({ matches: installed && query.includes('standalone') })
  const navigator = {
    userAgent: ios ? 'Mozilla/5.0 (iPhone)' : 'Mozilla/5.0 (Android)',
    platform: ios ? 'iPhone' : 'Linux armv8l',
    maxTouchPoints: ios ? 5 : 1,
    standalone: false,
  }
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: window },
    navigator: { configurable: true, value: navigator },
  })
  try {
    const module = await import(`../install.js?test=${Math.random()}`)
    await run({ ...module, window })
  } finally {
    for (const key of ['window', 'navigator']) {
      const descriptor = saved[key]
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('an unavailable or already installed app never exposes a dead install button', async () => {
  await withInstall({}, async ({ wireInstall }) => {
    const button = new Button()
    wireInstall(button, {})
    assert.equal(button.hidden, true)
    await button.click()
    assert.equal(button.hidden, true)
  })
  await withInstall({ installed: true }, async ({ wireInstall, window }) => {
    const button = new Button()
    wireInstall(button, { showIosHint: () => assert.fail('installed apps need no hint') })
    assert.equal(button.hidden, true)
    await window.emit('beforeinstallprompt', {})
    assert.equal(button.hidden, true)
  })
})

test('beforeinstallprompt is consumed once and dismissal hides the spent action', async () => {
  await withInstall({}, async ({ wireInstall, window }) => {
    const button = new Button()
    let prevented = 0
    let prompted = 0
    wireInstall(button, { showIosHint: () => assert.fail('native prompt must not show an iOS hint') })
    await window.emit('beforeinstallprompt', {
      preventDefault: () => { prevented += 1 },
      prompt: async () => { prompted += 1 },
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    assert.equal(button.hidden, false)
    await button.click()
    assert.equal(prevented, 1)
    assert.equal(prompted, 1)
    assert.equal(button.hidden, true)
    assert.equal(button.disabled, false)
  })
})

test('a cancelled native prompt is hidden until the browser offers a new one', async () => {
  await withInstall({}, async ({ wireInstall, window }) => {
    const button = new Button()
    wireInstall(button, {})
    await window.emit('beforeinstallprompt', {
      preventDefault() {},
      prompt: async () => {},
      userChoice: { then: (_resolve, reject) => reject(new Error('cancelled')) },
    })
    await button.click()
    assert.equal(button.hidden, true)
    assert.equal(button.disabled, false)
  })
})

test('iOS gets real instructions until standalone installation completes', async () => {
  await withInstall({ ios: true }, async ({ wireInstall, window }) => {
    const button = new Button()
    let hints = 0
    wireInstall(button, { showIosHint: () => { hints += 1 } })
    assert.equal(button.hidden, false)
    await button.click()
    assert.equal(hints, 1)
    await window.emit('appinstalled')
    assert.equal(button.hidden, true)
  })
})
