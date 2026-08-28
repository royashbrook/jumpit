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
  terrainVisible,
  verticalCameraTarget,
} = await import('../game.js')

function canvasHarness(width = 390, height = 720) {
  const draws = []
  const imageDraws = []
  const ellipses = []
  const fills = []
  const arcs = []
  const translates = []
  const hiddenLights = []
  const moves = []
  const lines = []
  const quadratics = []
  const roundRects = []
  const strokes = []
  const texts = []
  let bounds = { width, height }
  const gradient = { addColorStop() {} }
  const noops = new Set([
    'arc', 'beginPath', 'clearRect', 'closePath', 'fill', 'restore', 'rotate',
    'save', 'scale', 'setTransform', 'strokeRect', 'strokeText',
  ])
  const context = new Proxy({}, {
    get(target, key) {
      if (key === 'drawImage') return (...args) => {
        draws.push(args)
        imageDraws.push({ args, translate: translates.at(-1) })
      }
      if (key === 'fillRect') return (...args) => fills.push({ args, fillStyle: target.fillStyle })
      if (key === 'ellipse') return (...args) => ellipses.push({
        args, fillStyle: target.fillStyle, shadowBlur: target.shadowBlur, shadowColor: target.shadowColor,
      })
      if (key === 'arc') return (...args) => arcs.push({ args, strokeStyle: target.strokeStyle, lineWidth: target.lineWidth })
      if (key === 'translate') return (...args) => translates.push(args)
      if (key === 'moveTo') return (...args) => moves.push(args)
      if (key === 'lineTo') return (...args) => lines.push(args)
      if (key === 'quadraticCurveTo') return (...args) => quadratics.push({ args, fillStyle: target.fillStyle, strokeStyle: target.strokeStyle })
      if (key === 'stroke') return () => strokes.push({ strokeStyle: target.strokeStyle, lineWidth: target.lineWidth })
      if (key === 'fillText') return (...args) => texts.push({ args, globalAlpha: target.globalAlpha })
      if (key === 'roundRect') return (...args) => {
        roundRects.push({ args, fillStyle: target.fillStyle, strokeStyle: target.strokeStyle })
        if (args[0] === -10 && args[1] === -42 && args[2] === 20 && args[3] === 25 && args[4] === 7) {
          hiddenLights.push({ fillStyle: target.fillStyle })
        }
      }
      if (key === 'createLinearGradient') return () => gradient
      if (key in target) return target[key]
      if (noops.has(key)) return () => {}
      throw new Error(`unexpected canvas API ${String(key)}`)
    },
    set(target, key, value) { target[key] = value; return true },
  })
  return {
    draws,
    ellipses,
    imageDraws,
    fills,
    arcs,
    translates,
    hiddenLights,
    moves,
    lines,
    quadratics,
    roundRects,
    strokes,
    texts,
    setBounds(nextWidth, nextHeight) { bounds = { width: nextWidth, height: nextHeight } },
    canvas: {
      width: 0,
      height: 0,
      getContext: () => context,
      getBoundingClientRect: () => bounds,
    },
  }
}

test('terrain culling keeps tall lift art through the viewport edge', () => {
  const lift = { x: 0, y: 353, w: 96, h: 16 }
  assert.equal(terrainVisible(lift, 0, 0, 320, 320), true,
    'a lift cable that reaches into view should not pop in late')
  assert.equal(terrainVisible({ ...lift, y: 385 }, 0, 0, 320, 320), false,
    'terrain beyond the two-tile art margin should stay culled')
})

test('the courier meets shelf tops and the bell stands on its authored finish lane', () => {
  const harness = canvasHarness(844, 320)
  const game = createGame(harness.canvas)
  const level = LEVELS.find(item => item.id === 'garden-1')
  game.start(level.id)
  game.resize()

  const courier = harness.imageDraws.find(({ args }) => args[0].src?.endsWith('courier-sheet.webp'))
  assert.ok(courier)

  const finishX = level.finish[1] * TILE
  const floor = (level.finish[2] + 1) * TILE
  assert.equal(courier.translate[1], floor, 'the sprite anchor should remain on the physics floor')
  assert.equal(courier.translate[1] + courier.args[6] + courier.args[8], floor + 9,
    'transparent shoe padding should sit below the collision feet')
  assert.equal(harness.moves.some(([x, y]) => x === finishX + 4 && y === floor), true)
  assert.equal(harness.lines.some(([x, y]) => x === finishX + 4 && y === floor - 70), true)
  const [, , terrainX, terrainY, terrainWidth] = level.terrain[0]
  const groundX = terrainX * TILE
  const groundY = terrainY * TILE
  const groundWidth = terrainWidth * TILE
  assert.equal(harness.moves.some(([x, y]) => x === groundX && y === groundY), true)
  assert.equal(harness.lines.some(([x, y]) => x === groundX + groundWidth && y === groundY), true,
    'the cartoon face should preserve the exact walkable edge')
  assert.equal(harness.quadratics.some(({ args }) =>
    args[0] === groundX + groundWidth && args[1] === groundY &&
    args[2] === groundX + groundWidth - 1 && args[3] === groundY + 7), true,
  'natural terrain should taper through a curved side')
  assert.equal(harness.quadratics.some(({ args, fillStyle }) =>
    args[1] >= groundY + 15 && args[3] <= groundY + 13 && fillStyle === '#8BC65A'), true,
  'the grass cap should finish in an organic scalloped edge')
  assert.equal(harness.quadratics.some(({ args, strokeStyle }) =>
    args[1] < groundY && strokeStyle === '#8BC65A'), true,
  'wide natural terrain should sprout curved grass tufts')
  assert.equal(harness.quadratics.filter(({ strokeStyle }) =>
    strokeStyle === 'rgb(20 26 23 / .25)').length > 4, true,
  'terrain faces should batch curved stone lines instead of pixel blocks')
  const texturedFaces = level.terrain.filter(([, , , , , height]) => height * TILE > 23).length
  const stoneStrokes = harness.strokes.filter(({ strokeStyle }) => strokeStyle === 'rgb(20 26 23 / .25)')
  assert.equal(stoneStrokes.length < texturedFaces, true,
    'offscreen terrain should not spend paths outside the camera')
  assert.equal(stoneStrokes.length <= texturedFaces, true,
    'each visible textured face should paint its stonework in at most one batch')
  assert.equal(harness.quadratics.some(({ fillStyle }) => fillStyle === '#8ECF68'), true,
    'floating leaf shelves should share the organic cap treatment')
  assert.equal(harness.fills.some(({ args }) => args[2] === 12 && args[3] === 7), false,
    'legacy rectangular face chips should stay removed')
  game.stop()
})

test('collecting the opening seed wires the gold Spark aura into live courier rendering', () => {
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
      const callback = pending
      assert.equal(typeof callback, 'function')
      pending = null
      callback(time)
      time += 1000 / 60
    }
    game.start('garden-1')
    game.setInput('right', true)
    for (let step = 0; step < 40 && !harness.ellipses.some(item => item.shadowColor === '#FFD563'); step += 1) tick()
    assert.equal(harness.ellipses.some(item => item.shadowColor === '#FFD563' && item.shadowBlur === 18), true)
    game.setInput('right', false)
    for (let step = 0; step < 240 && !harness.ellipses.some(item => item.shadowColor === '#FFD563' && item.shadowBlur === 4); step += 1) tick()
    assert.equal(harness.ellipses.some(item => item.shadowColor === '#FFD563' && item.shadowBlur === 4), true)
    const dimPulse = harness.ellipses.length
    for (let step = 0; step < 7; step += 1) tick()
    assert.equal(harness.ellipses.slice(dimPulse).some(item => item.shadowColor === '#FFD563' && item.shadowBlur === 18), true)
    game.stop()
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})

test('the runtime coach clears and the wrong-level bell cue reaches the canvas', () => {
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
      const firstText = harness.texts.length
      const callback = pending
      assert.equal(typeof callback, 'function')
      pending = null
      callback(time)
      time += 1000 / 60
      return harness.texts.slice(firstText).map(({ args }) => args[0])
    }

    game.start('garden-1')
    assert.equal(tick().includes('SLIDE TO RUN'), true)
    let labels = []
    for (let frame = 0; frame < 125; frame += 1) labels = tick()
    assert.equal(labels.includes('SLIDE TO RUN'), false)

    game.restart()
    tick()
    const replay = recordReplay(LEVELS[0])
    const bellLabels = []
    for (const encoded of replay.inputs.slice(0, 205)) {
      game.setInput('left', Boolean(encoded & 1))
      game.setInput('right', Boolean(encoded & 2))
      game.setInput('jump', Boolean(encoded & 4))
      bellLabels.push(...tick())
    }
    assert.equal(bellLabels.includes('BELL ↓'), true)
    game.stop()
  } finally {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  }
})

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

test('running, stopping, and reversal ease without pulling the camera backward', () => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  let pending = null
  let nextId = 0
  let time = 1
  globalThis.requestAnimationFrame = callback => { pending = callback; return ++nextId }
  globalThis.cancelAnimationFrame = () => {}

  try {
    const harness = canvasHarness(812, 375)
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
    const running = []
    for (const encoded of replay.inputs.slice(0, 80)) {
      game.setInput('left', Boolean(encoded & 1))
      game.setInput('right', Boolean(encoded & 2))
      game.setInput('jump', Boolean(encoded & 4))
      running.push(tick())
    }

    game.setInput('jump', false)
    game.setInput('right', false)
    game.setInput('left', false)
    const stopped = []
    for (let frame = 0; frame < 30; frame += 1) stopped.push(tick())
    const beforeStop = running.at(-1)
    assert.ok(beforeStop < -20 && beforeStop > -300)
    const runningStep = beforeStop - running.at(-2)
    const firstStoppedStep = stopped[0] - beforeStop
    assert.ok(Math.abs(firstStoppedStep - runningStep) < 1)
    const backwardStep = Math.max(...stopped.slice(1).map((value, index) => value - stopped[index]))
    assert.ok(backwardStep <= 1e-9, `camera pulled backward ${backwardStep.toFixed(2)} world pixels in one frame`)

    game.setInput('left', true)
    const beforeTurn = stopped.at(-1)
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
    for (const encoded of replay.inputs.slice(0, checkpointFrame + 1)) {
      game.setInput('left', Boolean(encoded & 1))
      game.setInput('right', Boolean(encoded & 2))
      game.setInput('jump', Boolean(encoded & 4))
      tick()
    }
    game.setInput('left', false)
    game.setInput('jump', false)
    game.setInput('right', true)
    let fallFrame = -1
    const deathTextStart = harness.texts.length
    for (let frame = 0; frame < 240 && fallFrame < 0; frame += 1) {
      tick()
      if (states.at(-1).message === 'BACK TO THE LANTERN') fallFrame = cameraX.length - 1
    }
    assert.ok(fallFrame >= 0, 'the deliberate post-checkpoint miss never respawned')

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
    const climbedY = Math.max(...cameraY.slice(0, fallFrame))
    assert.ok(climbedY > cameraY[0] + TILE * 2)
    assert.equal(states.some(state => state.message === 'LANTERN LIT · CHECKPOINT!'), true)
    assert.equal(states.at(-1).message, 'BACK TO THE LANTERN')
    assert.equal(states.at(-1).respawning, true)
    assert.equal(harness.texts.slice(deathTextStart).some(({ args }) => args[0] === 'WHOOPS!'), true)
    assert.ok(Math.abs(cameraX[fallFrame] - expectedCheckpointX) > TILE)

    game.setInput('right', true)
    game.setInput('jump', true)
    for (let frame = 0; frame < 20; frame += 1) tick()
    assert.equal(harness.texts.slice(deathTextStart)
      .some(({ args, globalAlpha }) => args[0] === 'WHOOPS!' && globalAlpha > .5), true)
    assert.ok(cameraX.slice(fallFrame, fallFrame + 21).every(value => value === cameraX[fallFrame]))
    assert.ok(cameraY.slice(fallFrame, fallFrame + 21).every(value => value === cameraY[fallFrame]))

    tick()
    assert.ok(Math.abs(cameraX.at(-1) - expectedCheckpointX) < 1e-9)
    assert.ok(Math.abs(cameraY.at(-1) - expectedCheckpointY) < 1e-9)
    for (let frame = 21; frame < 42; frame += 1) tick()
    assert.equal(states.at(-1).respawning, false)
    assert.equal(states.at(-1).message, '')
    const settledX = cameraX.at(-1)
    tick()
    assert.ok(Math.abs(cameraX.at(-1) - settledX) < 1e-9, 'held input leaked through respawn')
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
