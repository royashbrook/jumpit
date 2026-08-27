import assert from 'node:assert/strict'
import test from 'node:test'
import { recordHiddenLightReplay, recordReplay } from '../engine/solvability.js'
import { LEVELS, TILE } from '../levels.js'

class FakeImage {
  static instances = []
  constructor() {
    this.source = ''
    this.complete = true
    this.naturalWidth = 1536
    this.naturalHeight = 1024
    FakeImage.instances.push(this)
  }
  set src(value) { this.source = value }
  get src() { return this.source }
  decode() { return Promise.resolve() }
  addEventListener() {}
  removeAttribute(name) { if (name === 'src') this.source = '' }
}

globalThis.Image = FakeImage
globalThis.devicePixelRatio = 1
globalThis.window = { addEventListener() {} }
globalThis.requestAnimationFrame = () => 1
globalThis.cancelAnimationFrame = () => {}

const {
  ART_SOURCES,
  artKeysForLevel,
  cameraScale,
  cameraTarget,
  createGame,
  verticalCameraTarget,
} = await import('../game.js')

function canvasHarness(width = 390, height = 720) {
  const draws = []
  const arcs = []
  const translates = []
  const hiddenLights = []
  let bounds = { width, height }
  const gradient = { addColorStop() {} }
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'drawImage') return (...args) => draws.push(args)
      if (key === 'arc') return (...args) => arcs.push({ args, strokeStyle: target.strokeStyle, lineWidth: target.lineWidth })
      if (key === 'translate') return (...args) => translates.push(args)
      if (key === 'roundRect') return (...args) => {
        if (args[0] === -10 && args[1] === -42 && args[2] === 20 && args[3] === 25 && args[4] === 7) {
          hiddenLights.push({ fillStyle: target.fillStyle })
        }
      }
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
    hiddenLights,
    setBounds(nextWidth, nextHeight) { bounds = { width: nextWidth, height: nextHeight } },
    canvas: {
      width: 0,
      height: 0,
      getContext: () => context,
      getBoundingClientRect: () => bounds,
    },
  }
}

test('all four later places render their own generated atlas rows', () => {
  const rain = canvasHarness()
  const rainGame = createGame(rain.canvas)
  rainGame.start('rooftop-1')
  rainGame.resize()
  const rainAtlas = rain.draws.find(args => args[0].src?.endsWith('region-atlas.webp'))
  assert.ok(rainAtlas)
  assert.equal(rainAtlas[2], 0)

  const workshop = canvasHarness()
  const workshopGame = createGame(workshop.canvas)
  workshopGame.start('workshop-1')
  workshopGame.resize()
  const workshopAtlas = workshop.draws.find(args => args[0].src?.endsWith('region-atlas.webp'))
  assert.ok(workshopAtlas)
  assert.equal(workshopAtlas[2], 512)

  const market = canvasHarness()
  const marketGame = createGame(market.canvas)
  marketGame.start('market-1')
  marketGame.resize()
  const marketAtlas = market.draws.find(args => args[0].src?.endsWith('final-atlas.webp'))
  assert.ok(marketAtlas)
  assert.equal(marketAtlas[2], 0)

  const keep = canvasHarness()
  const keepGame = createGame(keep.canvas)
  keepGame.start('keep-1')
  keepGame.resize()
  const keepAtlas = keep.draws.find(args => args[0].src?.endsWith('final-atlas.webp'))
  assert.ok(keepAtlas)
  assert.equal(keepAtlas[2], 512)
})

test('a landscape Keep render crops vertically and survives a wider resize', () => {
  const harness = canvasHarness(844, 320)
  const game = createGame(harness.canvas)
  game.start('keep-2')
  game.resize()
  assert.equal(harness.canvas.width, 844)
  assert.equal(harness.canvas.height, 320)
  assert.ok(harness.translates[0][1] < 0)

  const nextTransform = harness.translates.length
  harness.setBounds(912, 350)
  game.resize()
  assert.equal(harness.canvas.width, 912)
  assert.equal(harness.canvas.height, 350)
  assert.ok(harness.translates[nextTransform][1] < 0)
  game.stop()
})

test('a running reversal turns the camera without snapping across the trail', () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let pending = null
  let nextId = 0
  let time = 1
  globalThis.requestAnimationFrame = callback => { pending = callback; return ++nextId }
  globalThis.cancelAnimationFrame = () => {}

  try {
    const harness = canvasHarness(844, 320)
    const game = createGame(harness.canvas)
    const tick = () => {
      const firstTranslate = harness.translates.length
      const callback = pending
      assert.equal(typeof callback, 'function')
      pending = null
      callback(time)
      time += 1000 / 60
      return harness.translates[firstTranslate][0]
    }

    game.start('garden-1')
    tick()
    const replay = recordReplay(LEVELS[0])
    let beforeTurn = 0
    for (const encoded of replay.inputs.slice(0, 120)) {
      game.setInput('left', Boolean(encoded & 1))
      game.setInput('right', Boolean(encoded & 2))
      game.setInput('jump', Boolean(encoded & 4))
      beforeTurn = tick()
    }

    game.setInput('jump', false)
    game.setInput('right', false)
    game.setInput('left', true)
    assert.ok(beforeTurn < -280)
    const firstTurn = tick()
    assert.ok(Math.abs(firstTurn - beforeTurn) < 8)

    const turnFrames = []
    for (let frame = 0; frame < 30; frame += 1) turnFrames.push(tick())
    assert.ok(turnFrames.some(value => value > firstTurn))
    game.stop()
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})

test('the landscape Keep camera follows a climb and resets to its lit checkpoint after a fall', () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let pending = null
  let nextId = 0
  let time = 1
  globalThis.requestAnimationFrame = callback => { pending = callback; return ++nextId }
  globalThis.cancelAnimationFrame = () => {}

  try {
    const width = 844
    const height = 320
    const harness = canvasHarness(width, height)
    const states = []
    const game = createGame(harness.canvas, state => states.push(state))
    const level = LEVELS.find(item => item.id === 'keep-2')
    const replay = recordReplay(level)
    const checkpointFrame = replay.eventFrames.checkpoint[0]
    const fallFrame = replay.eventFrames.fall.find(frame => frame > checkpointFrame)
    const cameraX = []
    const cameraY = []
    const tick = () => {
      const firstTranslate = harness.translates.length
      const callback = pending
      assert.equal(typeof callback, 'function')
      pending = null
      callback(time)
      time += 1000 / 60
      cameraX.push(harness.translates[firstTranslate][0])
      cameraY.push(harness.translates[firstTranslate][1])
    }

    game.start(level.id)
    tick()
    for (const encoded of replay.inputs.slice(0, fallFrame)) {
      game.setInput('left', Boolean(encoded & 1))
      game.setInput('right', Boolean(encoded & 2))
      game.setInput('jump', Boolean(encoded & 4))
      tick()
    }

    const checkpoint = level.objects.find(([, kind]) => kind === 'checkpoint')
    const viewWidth = width / cameraScale(width, height)
    const viewHeight = height / cameraScale(width, height)
    const expectedCheckpointX = -cameraTarget({
      playerX: checkpoint[2] * TILE + TILE / 2 - 14,
      direction: 0,
      viewWidth,
      worldWidth: level.size[0] * TILE,
    })
    const expectedCheckpointY = -verticalCameraTarget({
      playerY: (checkpoint[3] + 1) * TILE - 42,
      playerHeight: 42,
      viewHeight,
    })
    const climbedY = Math.max(...cameraY.slice(checkpointFrame, fallFrame))
    assert.ok(climbedY > cameraY[0] + TILE * 2)
    assert.equal(states.some(state => state.message === 'LANTERN LIT · CHECKPOINT!'), true)
    assert.equal(states.at(-1).message, 'BACK TO THE LANTERN')
    assert.ok(Math.abs(cameraX[fallFrame] - expectedCheckpointX) < 1e-9)
    assert.ok(Math.abs(cameraY[fallFrame] - expectedCheckpointY) < 1e-9)
    game.stop()
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})

test('each place loads only its required WebP set and tears the previous place down', () => {
  assert.ok(Object.values(ART_SOURCES).every(source => source.endsWith('.webp')))
  const byId = id => LEVELS.find(level => level.id === id)
  assert.deepEqual(artKeysForLevel(byId('garden-1')), ['courier', 'gardenBackground', 'world'])
  assert.deepEqual(artKeysForLevel(byId('rooftop-1')), ['courier', 'regionBackground', 'region'])
  assert.deepEqual(artKeysForLevel(byId('workshop-1')), ['courier', 'regionBackground', 'region'])
  assert.deepEqual(artKeysForLevel(byId('market-1')), ['courier', 'finalBackground', 'final'])
  assert.deepEqual(artKeysForLevel(byId('keep-1')), ['courier', 'finalBackground', 'final'])
  assert.deepEqual(artKeysForLevel(byId('keep-3')), ['courier', 'finalBackground', 'final', 'region'])

  const firstImage = FakeImage.instances.length
  const game = createGame(canvasHarness().canvas)
  const images = Object.fromEntries(Object.keys(ART_SOURCES).map((key, index) => [key, FakeImage.instances[firstImage + index]]))
  game.start('garden-1')
  assert.deepEqual(Object.entries(images).filter(([, image]) => image.src).map(([key]) => key), [
    'gardenBackground', 'courier', 'world',
  ])
  game.start('market-1')
  assert.deepEqual(Object.entries(images).filter(([, image]) => image.src).map(([key]) => key), [
    'finalBackground', 'courier', 'final',
  ])
  assert.equal(images.gardenBackground.src, '')
  assert.equal(images.world.src, '')
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

test('real Hidden Light discovery renders warm feedback and rehydrates without rediscovery', () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let pending = null
  let nextId = 0
  let time = 1
  globalThis.requestAnimationFrame = callback => { pending = callback; return ++nextId }
  globalThis.cancelAnimationFrame = () => {}

  const tick = () => {
    const callback = pending
    assert.equal(typeof callback, 'function')
    pending = null
    callback(time)
    time += 1000 / 60
  }
  const setReplayInput = (game, encoded) => {
    game.setInput('left', Boolean(encoded & 1))
    game.setInput('right', Boolean(encoded & 2))
    game.setInput('jump', Boolean(encoded & 4))
  }
  const playReplay = (game, inputs, until = () => false) => {
    for (const encoded of inputs) {
      setReplayInput(game, encoded)
      tick()
      if (until()) break
    }
  }

  try {
    const level = LEVELS.find(item => item.id === 'garden-3')
    const replay = recordHiddenLightReplay(level)
    const harness = canvasHarness()
    const states = []
    const cues = []
    const game = createGame(harness.canvas, state => states.push(state), cue => cues.push(cue))
    game.start(level.id)
    tick()
    playReplay(game, replay.inputs, () => states.some(state => state.hiddenLightId === 'g03-hidden-light'))

    assert.equal(states.filter(state => state.hiddenLightId === 'g03-hidden-light').length, 1)
    assert.equal(cues.filter(cue => cue === 'hidden-light').length, 1)
    assert.equal(harness.arcs.some(entry => entry.strokeStyle === '#FFE377' && entry.lineWidth === 4), true)
    assert.equal(harness.hiddenLights.at(-1)?.fillStyle, '#FFF4B0')

    game.restart()
    harness.arcs.length = 0
    harness.hiddenLights.length = 0
    tick()
    playReplay(game, replay.inputs)
    assert.equal(states.filter(state => state.hiddenLightId === 'g03-hidden-light').length, 1)
    assert.equal(cues.filter(cue => cue === 'hidden-light').length, 1)
    assert.equal(harness.arcs.some(entry => entry.strokeStyle === '#FFE377' && entry.lineWidth === 4), false)
    assert.equal(harness.hiddenLights.some(light => light.fillStyle === '#FFF4B0'), true)
    game.stop()

    const restoredHarness = canvasHarness()
    const restoredStates = []
    const restoredCues = []
    const restored = createGame(
      restoredHarness.canvas,
      state => restoredStates.push(state),
      cue => restoredCues.push(cue),
    )
    restored.start(level.id, { foundHiddenLights: ['g03-hidden-light'] })
    tick()
    playReplay(restored, replay.inputs)
    assert.equal(restoredStates.some(state => state.hiddenLightId), false)
    assert.equal(restoredCues.includes('hidden-light'), false)
    assert.equal(restoredHarness.hiddenLights.some(light => light.fillStyle === '#FFF4B0'), true)
    restored.stop()
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})
