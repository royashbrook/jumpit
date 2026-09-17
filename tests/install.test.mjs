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
    const module = await import(`../src/install.ts?test=${Math.random()}`)
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

test('dispose removes install listeners and allows a clean remount', async () => {
  await withInstall({ ios: true }, async ({ wireInstall, window }) => {
    const button = new Button()
    let hints = 0
    const first = wireInstall(button, { showIosHint: () => { hints += 1 } })
    first.dispose()
    first.dispose()
    assert.equal(window.listeners.get('beforeinstallprompt').length, 0)
    assert.equal(window.listeners.get('appinstalled').length, 0)
    assert.equal(button.listeners.get('click').length, 0)
    await button.click()
    assert.equal(hints, 0)
    const second = wireInstall(button, { showIosHint: () => { hints += 1 } })
    await button.click()
    assert.equal(hints, 1)
    assert.equal(window.listeners.get('beforeinstallprompt').length, 1)
    second.dispose()
  })
})

test('a native prompt settling after disposal cannot mutate the old button', async () => {
  await withInstall({}, async ({ wireInstall, window }) => {
    const button = new Button()
    let finishPrompt
    const pendingPrompt = new Promise(resolve => { finishPrompt = resolve })
    const install = wireInstall(button)
    await window.emit('beforeinstallprompt', {
      preventDefault() {},
      prompt: () => pendingPrompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    const click = button.click()
    assert.equal(button.disabled, true)
    install.dispose()
    const snapshot = { hidden: button.hidden, disabled: button.disabled }
    finishPrompt()
    await click
    await window.emit('appinstalled')
    assert.deepEqual({ hidden: button.hidden, disabled: button.disabled }, snapshot)
    const next = new Button()
    const remounted = wireInstall(next)
    assert.equal(next.hidden, true)
    assert.equal(next.disabled, false)
    remounted.dispose()
  })
})

test('absent and already-installed controls still return disposable handles', async () => {
  await withInstall({ installed: true }, async ({ wireInstall, window }) => {
    wireInstall(null).dispose()
    wireInstall(new Button()).dispose()
    assert.equal(window.listeners.size, 0)
  })
})
