import assert from 'node:assert/strict'
import test from 'node:test'
import { createBody, isSideDamage, isStomp, stepPhysics } from '../engine/physics.js'

const floor = [{ type: 'solid', x: -100, y: 100, w: 500, h: 40 }]

function settle(body, terrain = floor) {
  for (let frame = 0; frame < 60; frame += 1) stepPhysics(body, {}, terrain)
  return body
}

test('the courier settles on solid ground and accelerates right', () => {
  const body = settle(createBody({ x: 10, y: 0 }))
  assert.equal(body.y + body.h, 100)
  assert.equal(body.onGround, true)
  stepPhysics(body, { right: true }, floor)
  assert.ok(body.vx > 0)
  assert.equal(body.facing, 1)
})

test('a real buffered launch emits one jump edge for sound and feedback', () => {
  const body = settle(createBody({ x: 10, y: 0 }))
  stepPhysics(body, { jumpPressed: true, jumpHeld: true }, floor)
  assert.equal(body.justJumped, true)
  stepPhysics(body, { jumpHeld: true }, floor)
  assert.equal(body.justJumped, false)
})

test('jump buffering fires on the first landing frame', () => {
  const body = createBody({ x: 10, y: 45 })
  body.vy = 4
  stepPhysics(body, { jumpPressed: true, jumpHeld: true }, floor)
  for (let frame = 0; frame < 8 && body.vy >= 0; frame += 1) {
    stepPhysics(body, { jumpHeld: true }, floor)
  }
  assert.ok(body.vy < 0)
  assert.equal(body.onGround, false)
})

test('coyote time allows a jump just after leaving a ledge', () => {
  const ledge = [{ type: 'solid', x: 0, y: 100, w: 50, h: 40 }]
  const body = settle(createBody({ x: 20, y: 0 }), ledge)
  body.x = 60
  stepPhysics(body, {}, ledge)
  stepPhysics(body, { jumpPressed: true, jumpHeld: true }, ledge)
  assert.ok(body.vy < 0)
})

test('releasing jump early makes a shorter arc', () => {
  const held = settle(createBody({ x: 10, y: 0 }))
  const cut = settle(createBody({ x: 60, y: 0 }))
  stepPhysics(held, { jumpPressed: true, jumpHeld: true }, floor)
  stepPhysics(cut, { jumpPressed: true, jumpHeld: true }, floor)
  stepPhysics(held, { jumpHeld: true }, floor)
  stepPhysics(cut, { jumpHeld: false }, floor)
  assert.ok(cut.vy > held.vy)
})

test('stomps are distinct from side contact', () => {
  const target = { x: 40, y: 80, w: 30, h: 24 }
  assert.equal(isStomp({ x: 42, y: 35, w: 24, h: 42, vy: 5 }, target), true)
  assert.equal(isSideDamage({ x: 30, y: 70, w: 24, h: 42, vy: 0 }, target), true)
})
