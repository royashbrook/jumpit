import assert from 'node:assert/strict'
import test from 'node:test'

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
  const gradient = { addColorStop() {} }
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'drawImage') return (...args) => draws.push(args)
      if (key === 'createLinearGradient') return () => gradient
      if (!(key in target)) target[key] = () => {}
      return target[key]
    },
    set(target, key, value) { target[key] = value; return true },
  })
  return {
    draws,
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
