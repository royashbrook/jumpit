import assert from 'node:assert/strict'
import test from 'node:test'
import { recordReplay, replayLevel } from '../engine/solvability.js'
import { createSimulation, stepSimulation } from '../engine/simulation.js'
import { LEVELS } from '../levels.js'

const level = id => LEVELS.find(item => item.id === id)
const eventTypes = (simulation, input = {}) => stepSimulation(simulation, input).map(event => event.type)

function placePlayer(simulation, x, y, vy = 0, onGround = false) {
  Object.assign(simulation.player, {
    x,
    y,
    vx: 0,
    vy,
    onGround,
    coyote: onGround ? 6 : 0,
    jumpBuffer: 0,
    jumpWasHeld: false,
  })
}

test('all twenty trails finish by replaying inputs through the runtime transition', () => {
  const receipts = []
  for (const entry of LEVELS) {
    const recorded = recordReplay(entry)
    const replayed = replayLevel(entry, recorded.inputs)
    receipts.push({
      id: entry.id,
      finishable: recorded.finishable && replayed.finishable,
      frames: replayed.frames,
      replayFrames: recorded.inputs.length,
      hash: replayed.hash,
      events: replayed.events,
    })
    assert.equal(replayed.hash, recorded.hash, `${entry.id} replay drifted`)
    assert.equal(replayed.frames, recorded.inputs.length, `${entry.id} did not consume its exact replay`)
    assert.equal(replayed.events.finish, 1, `${entry.id} did not ring its real finish bell once`)
  }

  assert.deepEqual(receipts.filter(receipt => !receipt.finishable), [], JSON.stringify(receipts, null, 2))
  assert.equal(new Set(receipts.map(receipt => receipt.hash)).size, LEVELS.length)
})

test('the twenty replays exercise every progressive runtime mechanic', () => {
  const totals = {}
  for (const entry of LEVELS) {
    const replay = recordReplay(entry)
    for (const [type, count] of Object.entries(replay.events)) totals[type] = (totals[type] || 0) + count
  }
  for (const type of [
    'seed', 'cloak', 'checkpoint', 'stomp', 'spring', 'fan', 'switch', 'lamp', 'crumble',
    'lift', 'guardian-hit', 'guardian-defeated', 'finish',
  ]) assert.ok(totals[type] > 0, `${type} never occurred in the twenty real replays`)
})

test('First Light pays off fast and Windward Tower stays forgiving', () => {
  const first = recordReplay(level('garden-1'))
  assert.ok(first.eventFrames.seed?.[0] <= 30, `first seed arrived on frame ${first.eventFrames.seed?.[0]}`)
  assert.ok(first.eventFrames.stomp?.[0] <= 60, `first stomp arrived on frame ${first.eventFrames.stomp?.[0]}`)
  assert.equal(first.eventFrames.finish?.[0], first.frames)
  assert.ok(first.frames <= 240, `first bell arrived on frame ${first.frames}`)
  assert.equal(first.respawns, 0)

  const tower = recordReplay(level('keep-3'))
  assert.equal(tower.eventFrames.finish?.[0], tower.frames)
  assert.ok(tower.frames <= 600, `tower bell arrived on frame ${tower.frames}`)
  assert.ok(tower.respawns <= 1, `tower needed ${tower.respawns} respawns`)
  assert.equal(level('keep-3').objects.filter(([, kind]) => kind === 'sentry').length, 3)
})

test('one fixed step owns crumble, switch, lamp, fan, lift, checkpoint, and enemy rules', () => {
  const crumble = createSimulation(level('garden-4'))
  const bank = crumble.world.terrain.find(rect => rect.kind === 'crumble')
  placePlayer(crumble, bank.x + 12, bank.y - crumble.player.h, 0, true)
  let crumbleEvents = []
  for (let frame = 0; frame < 43; frame += 1) crumbleEvents.push(...eventTypes(crumble))
  assert.ok(crumbleEvents.includes('crumble'))
  assert.equal(bank.active, false)

  const workshop = createSimulation(level('workshop-4'))
  const button = workshop.world.switches[0]
  const bridge = workshop.world.terrain.find(rect => rect.id === button.targetId)
  placePlayer(workshop, button.x - 14, button.y - workshop.player.h, 0, true)
  assert.ok(eventTypes(workshop).includes('switch'))
  assert.equal(bridge.active, true)

  const market = createSimulation(level('market-4'))
  const lamp = market.world.lamps[0]
  const gate = market.world.gates.find(item => item.id === lamp.targetId)
  placePlayer(market, lamp.x - 14, lamp.y - market.player.h, 0, true)
  assert.ok(eventTypes(market).includes('lamp'))
  assert.equal(gate.active, false)

  const rooftop = createSimulation(level('rooftop-2'))
  const fan = rooftop.world.fans[0]
  placePlayer(rooftop, fan.x - rooftop.player.w / 2, fan.y - 110)
  assert.ok(eventTypes(rooftop).includes('fan'))
  assert.ok(rooftop.player.vy < .62)

  const loft = createSimulation(level('workshop-3'))
  const lift = loft.world.terrain.find(rect => rect.kind === 'lift')
  placePlayer(loft, lift.x + 12, lift.y - loft.player.h, 0, true)
  assert.ok(eventTypes(loft).includes('lift'))

  const garden = createSimulation(level('garden-1'))
  const checkpoint = garden.world.checkpoint
  placePlayer(garden, checkpoint.x - 14, checkpoint.y - garden.player.h, 0, true)
  assert.ok(eventTypes(garden).includes('checkpoint'))
  assert.equal(garden.player.spawnX, checkpoint.x - garden.player.w / 2)

  const keep = createSimulation(level('keep-1'))
  const sentry = keep.world.enemies.find(enemy => enemy.kind === 'sentry')
  placePlayer(keep, sentry.x + 6, sentry.y - keep.player.h, 1)
  assert.ok(eventTypes(keep).includes('stomp'))
  assert.equal(sentry.alive, false)
})

test('the shared transition enforces three Warden stomps before the guarded bell', () => {
  const simulation = createSimulation(level('keep-4'))
  const { world, player } = simulation
  const warden = world.enemies.find(enemy => enemy.kind === 'warden')

  placePlayer(simulation, world.finish.x, world.finish.y - 40)
  assert.ok(eventTypes(simulation).includes('guardian-locked'))
  assert.equal(simulation.finished, false)

  const hits = []
  for (let hit = 0; hit < 3; hit += 1) {
    warden.invulnerable = 0
    placePlayer(simulation, warden.x + 8, warden.y - player.h, 1)
    hits.push(...eventTypes(simulation))
  }
  assert.deepEqual(hits.filter(type => type.startsWith('guardian-')), [
    'guardian-hit', 'guardian-hit', 'guardian-defeated',
  ])
  assert.equal(warden.alive, false)

  placePlayer(simulation, world.finish.x, world.finish.y - 40)
  assert.ok(eventTypes(simulation).includes('finish'))
  assert.equal(simulation.finished, true)
})
