import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activateCheckpoint,
  activateLamps,
  activateSwitches,
  advanceEnemy,
  coachMessage,
  enemyAttackLands,
  finishOutcome,
  guardianState,
  makeWorld,
  strikeEnemy,
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
  assert.equal(world.cloak.length, 1)
  assert.equal(world.cloak[0].found, false)
})

test('later Garden Walk trails carry their authored mechanics into runtime worlds', () => {
  const rise = makeWorld(LEVELS[2])
  const bramble = makeWorld(LEVELS[3])
  assert.equal(rise.springs.length, 1)
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
  assert.equal(coachMessage({ moved: false, jumped: false, glowing: false, x: 60 }), 'RUN RIGHT · TAP JUMP')
  assert.equal(coachMessage({ moved: true, jumped: false, glowing: false, x: 190 }), 'TAP JUMP · LAND ON TOP')
  assert.equal(coachMessage({ moved: true, jumped: true, glowing: true, x: 400 }), 'GLOWING? BUMP CREATURES!')
  assert.equal(coachMessage({ moved: true, jumped: true, glowing: false, x: 700 }), '')
})
