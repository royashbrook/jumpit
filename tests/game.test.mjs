import assert from 'node:assert/strict'
import test from 'node:test'
import { activateCheckpoint, makeWorld } from '../game.js'
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
