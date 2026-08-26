import assert from 'node:assert/strict'
import test from 'node:test'
import { recordReplay } from '../engine/solvability.js'
import { LEVELS } from '../levels.js'

class FakeImage {
  constructor() {
    this.complete = true
    this.naturalWidth = 1536
    this.naturalHeight = 1024
  }
  set src(value) { this.source = value }
  get src() { return this.source }
  decode() { return Promise.resolve() }
  addEventListener() {}
}

globalThis.Image = FakeImage
globalThis.devicePixelRatio = 1
globalThis.window = { addEventListener() {} }
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}

const { createGame } = await import('../game.js')

function canvasHarness() {
  const draws = []
  const arcs = []
  const translates = []
  const gradient = { addColorStop() {} }
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'drawImage') return (...args) => draws.push(args)
      if (key === 'arc') return (...args) => arcs.push({ args, strokeStyle: target.strokeStyle, lineWidth: target.lineWidth })
      if (key === 'translate') return (...args) => translates.push(args)
      if (key === 'createLinearGradient') return () => gradient
      if (!(key in target)) target[key] = () => {}
      return target[key]
    },
    set(target, key, value) { target[key] = value; return true },
  })
  return {
    draws,
    arcs,
    translates,
    canvas: {
      width: 0,
      height: 0,
      getContext: () => context,
      getBoundingClientRect: () => ({ width: 390, height: 720 }),
    },
  }
}

test('all four later places render their own generated atlas rows', () => {
  const rain = canvasHarness()
  const rainGame = createGame(rain.canvas)
  rainGame.start('rooftop-1')
  rainGame.resize()
  const rainAtlas = rain.draws.find(args => args[0].src?.endsWith('region-atlas.png'))
  assert.ok(rainAtlas)
  assert.equal(rainAtlas[2], 0)

  const workshop = canvasHarness()
  const workshopGame = createGame(workshop.canvas)
  workshopGame.start('workshop-1')
  workshopGame.resize()
  const workshopAtlas = workshop.draws.find(args => args[0].src?.endsWith('region-atlas.png'))
  assert.ok(workshopAtlas)
  assert.equal(workshopAtlas[2], 512)

  const market = canvasHarness()
  const marketGame = createGame(market.canvas)
  marketGame.start('market-1')
  marketGame.resize()
  const marketAtlas = market.draws.find(args => args[0].src?.endsWith('final-atlas.png'))
  assert.ok(marketAtlas)
  assert.equal(marketAtlas[2], 0)

  const keep = canvasHarness()
  const keepGame = createGame(keep.canvas)
  keepGame.start('keep-1')
  keepGame.resize()
  const keepAtlas = keep.draws.find(args => args[0].src?.endsWith('final-atlas.png'))
  assert.ok(keepAtlas)
  assert.equal(keepAtlas[2], 512)
})

test('backgrounding can pause the running loop without toggling it back on', () => {
  const harness = canvasHarness()
  const states = []
  const game = createGame(harness.canvas, state => states.push(state))
  game.start('garden-1')
  assert.equal(game.pause(), true)
  assert.equal(game.pause(), true)
  assert.equal(states.at(-1).paused, true)
})

test('reward feedback decays after finish and cannot leak through restart', () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let pending = null
  let nextId = 0
  globalThis.requestAnimationFrame = callback => { pending = callback; return ++nextId }
  globalThis.cancelAnimationFrame = () => {}

  try {
    const harness = canvasHarness()
    const states = []
    const game = createGame(harness.canvas, state => states.push(state))
    let time = 1
    const tick = () => {
      const callback = pending
      assert.equal(typeof callback, 'function')
      pending = null
      callback(time)
      time += 1000 / 60
    }
    const setReplayInput = encoded => {
      game.setInput('left', Boolean(encoded & 1))
      game.setInput('right', Boolean(encoded & 2))
      game.setInput('jump', Boolean(encoded & 4))
    }
    const hasRing = color => harness.arcs.some(entry => entry.strokeStyle === color && entry.lineWidth === 4)
    const replay = recordReplay(LEVELS[0])

    game.start('garden-1')
    tick()
    for (const encoded of replay.inputs.slice(0, 20)) {
      setReplayInput(encoded)
      tick()
    }
    assert.equal(hasRing('#FFD563'), true)

    game.restart()
    harness.arcs.length = 0
    tick()
    harness.translates.length = 0
    tick()
    assert.equal(hasRing('#FFD563'), false)
    assert.ok(Math.abs(harness.translates[0][0]) < Number.EPSILON)

    game.restart()
    harness.arcs.length = 0
    tick()
    for (const encoded of replay.inputs) {
      setReplayInput(encoded)
      tick()
      if (states.at(-1)?.finished) break
    }
    if (!states.at(-1)?.finished) tick()
    assert.equal(states.at(-1)?.finished, true)
    assert.equal(hasRing('#FFF4B0'), true)

    for (let frame = 0; frame < 14; frame += 1) tick()
    harness.arcs.length = 0
    tick()
    assert.equal(hasRing('#FFF4B0'), false)
    game.stop()
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})
