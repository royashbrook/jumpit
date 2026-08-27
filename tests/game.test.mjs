import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activateCheckpoint,
  activateLamps,
  activateSwitches,
  advanceEnemy,
  backgroundCrop,
  cameraProgress,
  cameraScale,
  cameraTarget,
  clearInputState,
  coachMessage,
  createGame,
  enemyAttackLands,
  finishOutcome,
  guardianState,
  impactFeedback,
  interactiveKeyTarget,
  keyInputMode,
  makeWorld,
  playHint,
  setInputState,
  strikeEnemy,
  verticalCameraTarget,
} from '../game.js'
import { createBody } from '../engine/physics.js'
import { LEVELS, TILE } from '../levels.js'

test('the checkpoint becomes the courier restart point exactly once', () => {
  const world = makeWorld(LEVELS[0])
  const player = createBody({
    x: world.checkpoint.x - 14,
    y: world.checkpoint.y - 42,
  })
  player.spawnX = LEVELS[0].spawn[0] * TILE
  player.spawnY = LEVELS[0].spawn[1] * TILE
  assert.equal(activateCheckpoint(world, player), true)
  assert.equal(world.checkpoint.active, true)
  assert.equal(player.spawnX, world.checkpoint.x - player.w / 2)
  assert.equal(player.spawnY, world.checkpoint.y - player.h)
  assert.equal(activateCheckpoint(world, player), false)
})

test('the first playable trail includes its toy-layer objects', () => {
  const world = makeWorld(LEVELS[0])
  assert.equal(world.enemies.length, 1)
  assert.equal(world.enemies[0].kind, 'mossling')
  assert.equal(world.cloak.length, 0)
  const next = makeWorld(LEVELS[1])
  assert.equal(next.cloak.length, 1)
  assert.equal(next.cloak[0].found, false)
})

test('later Garden Walk trails carry their authored mechanics into runtime worlds', () => {
  const rise = makeWorld(LEVELS[2])
  const bramble = makeWorld(LEVELS[3])
  assert.equal(rise.springs.length, 2)
  assert.ok(bramble.terrain.some(rect => rect.kind === 'crumble' && rect.active))
  assert.ok(bramble.enemies.length >= 2)
})

test('the v1 regions expose rain and workshop mechanics at runtime', () => {
  const rain = makeWorld(LEVELS[7])
  const workshop = makeWorld(LEVELS[11])
  assert.ok(rain.enemies.some(enemy => enemy.kind === 'drizzlet'))
  assert.ok(rain.fans.length >= 1)
  assert.ok(rain.terrain.some(rect => rect.kind === 'slick'))
  assert.ok(workshop.enemies.some(enemy => enemy.kind === 'gearling'))
  assert.ok(workshop.terrain.some(rect => rect.kind === 'belt'))
  assert.ok(workshop.terrain.some(rect => rect.kind === 'lift'))
  assert.ok(workshop.switches.length >= 1)
})

test('workshop switches raise their authored bridges once', () => {
  const world = makeWorld(LEVELS[11])
  const [button] = world.switches
  const bridge = world.terrain.find(item => item.id === button.targetId)
  assert.equal(bridge.active, false)
  const player = { x: button.x - 10, y: button.y - 30, w: 20, h: 30 }
  assert.equal(activateSwitches(world, player), true)
  assert.equal(button.active, true)
  assert.equal(bridge.active, true)
  assert.equal(activateSwitches(world, player), false)
})

test('Lantern Market carries Mothlights and lamps that open paired gates', () => {
  const world = makeWorld(LEVELS[15])
  assert.ok(world.enemies.some(enemy => enemy.kind === 'mothlight'))
  assert.equal(world.lamps.length, 2)
  assert.equal(world.gates.length, 2)
  const [lamp] = world.lamps
  const gate = world.gates.find(item => item.id === lamp.targetId)
  const player = { x: lamp.x - 10, y: lamp.y - 40, w: 20, h: 40 }
  assert.equal(activateLamps(world, player), true)
  assert.equal(lamp.lit, true)
  assert.equal(gate.open, true)
  assert.equal(gate.active, false)
  assert.equal(activateLamps(world, player), false)
})

test('Beacon Keep sentries patrol and turn at their authored range', () => {
  const world = makeWorld(LEVELS.find(level => level.id === 'keep-1'))
  const sentry = world.enemies.find(enemy => enemy.kind === 'sentry')
  const start = sentry.x
  advanceEnemy(sentry)
  assert.equal(sentry.x, start - 1)

  sentry.x = sentry.home - sentry.patrol
  sentry.vx = -1
  advanceEnemy(sentry)
  assert.equal(sentry.x, sentry.home - sentry.patrol)
  assert.equal(sentry.vx, 1)
})

test('the Beacon Warden takes exactly three separated hits', () => {
  const world = makeWorld(LEVELS.find(level => level.id === 'keep-4'))
  const warden = world.enemies.find(enemy => enemy.kind === 'warden')
  assert.equal(enemyAttackLands({ y: warden.y, h: 42, vy: 0, glowing: true }, warden), false)
  assert.equal(enemyAttackLands({ y: warden.y - 42, h: 42, vy: 5, glowing: false }, warden), true)
  assert.deepEqual(guardianState(world), {
    guardianHealth: 3,
    guardianMax: 3,
    guardianDefeated: false,
  })

  assert.deepEqual(strikeEnemy(warden), { hit: true, defeated: false })
  assert.equal(warden.health, 2)
  assert.deepEqual(strikeEnemy(warden), { hit: false, defeated: false })
  for (let frame = 0; frame < 22; frame += 1) advanceEnemy(warden, frame)
  assert.deepEqual(strikeEnemy(warden), { hit: true, defeated: false })
  assert.equal(warden.health, 1)
  for (let frame = 0; frame < 22; frame += 1) advanceEnemy(warden, frame)
  assert.deepEqual(strikeEnemy(warden), { hit: true, defeated: true })
  assert.equal(warden.alive, false)
  assert.deepEqual(guardianState(world), {
    guardianHealth: 0,
    guardianMax: 3,
    guardianDefeated: true,
  })
})

test('the finish bell stays locked until the Beacon Warden is defeated', () => {
  const world = makeWorld(LEVELS.find(level => level.id === 'keep-4'))
  const warden = world.enemies.find(enemy => enemy.kind === 'warden')
  const player = { x: world.finish.x, y: world.finish.y - 40, w: 28, h: 42 }

  assert.equal(finishOutcome(world, player), 'locked')
  assert.equal(finishOutcome(world, player), '')
  for (let hit = 0; hit < 3; hit += 1) {
    warden.invulnerable = 0
    strikeEnemy(warden)
  }
  assert.equal(finishOutcome(world, player), 'finished')
})

test('coaching is one short action at a time and then gets out of the way', () => {
  assert.equal(coachMessage({ moved: false, jumped: false, glowing: false, x: 60 }), 'SLIDE TO RUN')
  assert.equal(coachMessage({ moved: true, jumped: false, glowing: false, x: 190 }), 'TAP RIGHT TO JUMP')
  assert.equal(coachMessage({ moved: false, jumped: false, glowing: false, x: 60, frame: 119 }), 'SLIDE TO RUN')
  assert.equal(coachMessage({ moved: false, jumped: false, glowing: false, x: 60, frame: 120 }), '')
  assert.equal(coachMessage({ moved: true, jumped: true, glowing: true, x: 400 }), 'GLOW BUMPS CREATURES')
  assert.equal(coachMessage({ moved: true, jumped: true, glowing: false, x: 700 }), '')
  assert.deepEqual(playHint({ finished: false, moved: true, jumped: true, glowing: false, x: 700, y: 400, finishX: 1_000, finishY: 400 }), {
    kind: 'none',
    text: '',
  })
  assert.deepEqual(playHint({ finished: false, moved: true, jumped: true, glowing: false, x: 1_100, y: 400, finishX: 1_000, finishY: 400 }), {
    kind: 'none',
    text: '',
  })
  assert.deepEqual(playHint({ finished: true, moved: true, jumped: true, glowing: false, x: 700, y: 400, finishX: 1_000, finishY: 400 }), {
    kind: 'none',
    text: '',
  })
})

test('the bell guide points to the finish lane instead of an upper dead end', () => {
  for (const id of ['garden-2', 'rooftop-1', 'workshop-1', 'market-1']) {
    const world = makeWorld(LEVELS.find(level => level.id === id))
    const upper = { x: world.finish.x, y: world.finish.y - TILE * 2 - 42, w: 28, h: 42 }
    const supported = { ...upper, y: world.finish.y + TILE - 42 }
    assert.equal(finishOutcome(world, upper), '', `${id} upper shelf must not clear`)
    assert.equal(finishOutcome(world, supported), 'finished', `${id} finish lane must clear`)
    assert.equal(playHint({
      finished: false, moved: true, jumped: true, glowing: false,
      x: upper.x, y: upper.y, finishX: world.finish.x, finishY: world.finish.y,
    }).text, 'BELL ↓', id)
  }
  assert.equal(playHint({
    finished: false, moved: true, jumped: true, glowing: false,
    x: 1_000, y: 440, finishX: 1_000, finishY: 256,
  }).text, 'BELL ↑')
})

test('the landscape camera keeps the courier large and eases its look through a reversal', () => {
  const scale = cameraScale(844, 320)
  const viewWidth = 844 / scale
  const viewHeight = 320 / scale
  assert.equal(viewWidth, 28 * TILE)
  assert.ok(82 * scale >= 44)
  assert.deepEqual([-1, -.5, 0, .5, 1].map(direction =>
    cameraTarget({ playerX: 1_000, direction, viewWidth, worldWidth: 3_000 })), [
    1_000 - viewWidth * .7,
    1_000 - viewWidth * .6,
    1_000 - viewWidth * .5,
    1_000 - viewWidth * .4,
    1_000 - viewWidth * .3,
  ])
  assert.equal(cameraTarget({ playerX: 10, direction: 1, viewWidth, worldWidth: 3_000 }), 0)
  assert.equal(cameraTarget({ playerX: 3_000, direction: 1, viewWidth, worldWidth: 3_000 }), 3_000 - viewWidth)
  assert.equal(
    cameraTarget({ playerX: 1_000, direction: 1, viewWidth, worldWidth: 3_000, reducedMotion: true }),
    cameraTarget({ playerX: 1_000, direction: -1, viewWidth, worldWidth: 3_000, reducedMotion: true }),
  )
  assert.ok(verticalCameraTarget({ playerY: 438, playerHeight: 42, viewHeight }) > 0)
  assert.equal(verticalCameraTarget({ playerY: 0, playerHeight: 42, viewHeight }), 0)
  assert.equal(cameraProgress(3_000 - viewWidth, 3_000, viewWidth), 1)
})

test('landscape backgrounds keep their source aspect and retain room to pan', () => {
  for (const [imageWidth, rowHeight] of [[1_774, 887], [1_536, 512]]) {
    const start = backgroundCrop({ imageWidth, rowHeight, width: 844, height: 320, progress: 0 })
    const end = backgroundCrop({ imageWidth, rowHeight, width: 844, height: 320, progress: 1 })
    assert.ok(Math.abs(start.width / start.height - 844 / 320) < 1e-9)
    assert.equal(start.x, 0)
    assert.ok(end.x > 0)
    assert.ok(start.y >= 0)
    assert.ok(start.y + start.height <= rowHeight)
  }
})

test('reward feedback adds a short impact without moving reduced-motion play', () => {
  assert.deepEqual(impactFeedback('seed'), { frames: 9, kick: 3, expands: true })
  assert.deepEqual(impactFeedback('checkpoint'), { frames: 9, kick: 5, expands: true })
  assert.deepEqual(impactFeedback('hidden-light'), { frames: 48, kick: 0, expands: true })
  assert.deepEqual(impactFeedback('hidden-light', true), { frames: 48, kick: 0, expands: false })
  assert.deepEqual(impactFeedback('finish', true), { frames: 12, kick: 0, expands: false })
  assert.equal(impactFeedback('fan'), null)
})

test('overlay keyboard actions cannot preload a jump while paused or finished', () => {
  assert.equal(keyInputMode({ type: 'keydown', running: true, paused: true, finished: false }), 'ignore')
  assert.equal(keyInputMode({ type: 'keydown', running: true, paused: false, finished: true }), 'ignore')
  assert.equal(keyInputMode({ type: 'keyup', running: true, paused: true, finished: false }), 'release')
  assert.equal(keyInputMode({ type: 'keydown', running: true, paused: false, finished: false, respawning: true }), 'ignore')
  assert.equal(keyInputMode({ type: 'keyup', running: true, paused: false, finished: false, respawning: true }), 'release')
  assert.equal(keyInputMode({ type: 'keydown', running: true, paused: false, finished: false }), 'control')
  let selector = ''
  const button = { closest(value) { selector = value; return {} } }
  assert.equal(interactiveKeyTarget(button, 'Space'), true)
  assert.equal(interactiveKeyTarget(button, 'ArrowRight'), false)
  assert.equal(interactiveKeyTarget(button, 'KeyD'), false)
  assert.match(selector, /button/)
  assert.equal(interactiveKeyTarget({ closest: () => null }, 'Space'), false)
})

test('boundary input clearing cancels queued intent without weakening a quick tap', () => {
  const input = { left: true, right: true, jumpHeld: false, jumpPressed: false }
  const player = { jumpBuffer: 6, coyote: 4 }
  setInputState(input, 'jump', true)
  setInputState(input, 'jump', false)
  assert.equal(input.jumpPressed, true)
  assert.equal(input.jumpHeld, false)

  clearInputState(input, player)
  assert.deepEqual(input, { left: false, right: false, jumpHeld: false, jumpPressed: false })
  assert.equal(player.jumpBuffer, 0)
  assert.equal(player.coyote, 4)
})

test('large game art waits for the first play gesture', () => {
  const originals = new Map(['Image', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]))
  const images = []
  class FakeImage {
    constructor() {
      this.src = ''
      images.push(this)
    }
    addEventListener() {}
    decode() { return Promise.resolve() }
  }

  globalThis.Image = FakeImage
  globalThis.window = { addEventListener() {} }
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  try {
    const game = createGame({ getContext: () => ({}) })
    assert.equal(images.length, 7)
    assert.ok(images.every(image => image.src === ''))
    game.start('garden-1')
    assert.deepEqual(images.map(image => image.src).filter(Boolean).sort(), [
      'assets/backgrounds/garden-walk.webp',
      'assets/sprites/courier-sheet.webp',
      'assets/sprites/world-sheet.webp',
    ])
    game.stop()
  } finally {
    for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})
