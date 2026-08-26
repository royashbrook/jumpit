import assert from 'node:assert/strict'
import test from 'node:test'

import { createSimulation, finishOutcome, stepSimulation } from '../engine/simulation.js'
import { LEVELS, TILE } from '../levels.js'

const level = id => LEVELS.find(item => item.id === id)

function placePlayer(simulation, x, y, onGround = true) {
  Object.assign(simulation.player, {
    x,
    y,
    vx: 0,
    vy: 0,
    onGround,
    coyote: onGround ? 6 : 0,
    jumpBuffer: 0,
    jumpWasHeld: false,
  })
}

test('the shared transition finds a hidden light once and keeps it found through a respawn', () => {
  const simulation = createSimulation(level('garden-3'))
  const [hiddenLight] = simulation.world.hiddenLights
  assert.deepEqual(hiddenLight, {
    id: 'g03-hidden-light',
    x: 7.5 * TILE,
    y: 12 * TILE,
    found: false,
  })

  placePlayer(simulation, hiddenLight.x - simulation.player.w / 2, hiddenLight.y - simulation.player.h)
  const discovery = stepSimulation(simulation).find(event => event.type === 'hidden-light')
  assert.deepEqual(discovery, {
    type: 'hidden-light',
    cue: 'hidden-light',
    message: 'HIDDEN LIGHT FOUND!',
    burst: [hiddenLight.x, hiddenLight.y - 28, '#FFE377'],
    hiddenLightId: hiddenLight.id,
    region: 'garden',
  })
  assert.equal(hiddenLight.found, true)
  assert.equal(stepSimulation(simulation).some(event => event.type === 'hidden-light'), false)

  placePlayer(simulation, 0, simulation.world.height + 100, false)
  assert.ok(stepSimulation(simulation).some(event => event.type === 'fall'))
  placePlayer(simulation, hiddenLight.x - simulation.player.w / 2, hiddenLight.y - simulation.player.h)
  assert.equal(stepSimulation(simulation).some(event => event.type === 'hidden-light'), false)
  assert.equal(hiddenLight.found, true)
})

test('an unfound hidden light never guards the finish bell', () => {
  const simulation = createSimulation(level('garden-3'))
  const player = {
    x: simulation.world.finish.x,
    y: simulation.world.finish.y - 40,
    w: 28,
    h: 42,
  }
  assert.equal(simulation.world.hiddenLights[0].found, false)
  assert.equal(finishOutcome(simulation.world, player), 'finished')
  assert.equal(simulation.world.hiddenLights[0].found, false)
})
