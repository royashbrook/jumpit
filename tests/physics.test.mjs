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

test('a tap and a hold share one running jump that clears a three-tile shelf', () => {
  const ground = { type: 'solid', x: -100, y: 196, w: 500, h: 40 }
  const ledge = { type: 'oneway', x: 70, y: 100, w: 240, h: 16 }
  const bodies = [true, false].map(() => settle(createBody({ x: 20, y: 120 }), [ground]))
  for (const body of bodies) body.vx = body.config.maxRun

  const rises = []
  for (const [index, body] of bodies.entries()) {
    stepPhysics(body, { right: true, jumpPressed: true, jumpHeld: index === 0 }, [ground, ledge])
    let minimumFeet = body.y + body.h
    let landed = false
    for (let frame = 0; frame < 60; frame += 1) {
      stepPhysics(body, { right: true, jumpHeld: index === 0 }, [ground, ledge])
      minimumFeet = Math.min(minimumFeet, body.y + body.h)
      landed ||= body.onGround && body.y + body.h === ledge.y
    }
    rises.push(196 - minimumFeet)
    assert.equal(landed, true)
  }
  assert.ok(rises.every(rise => rise >= 105 && rise <= 107), rises.join(', '))
  assert.ok(Math.abs(rises[0] - rises[1]) < 1e-9)
})

test('a visible one-way shelf edge catches the courier without magnetic landings', () => {
  const ledge = { type: 'oneway', x: 0, y: 100, w: 100, h: 16 }
  const fallingAt = (x, direction) => {
    const body = createBody({ x, y: 53 })
    Object.assign(body, { vx: body.config.maxRun * direction, vy: 5 })
    return body
  }

  for (const attempt of [
    { x: 100, snapX: 99, direction: 1, input: { right: true } },
    { x: -28, snapX: -27, direction: -1, input: { left: true } },
  ]) {
    const caught = fallingAt(attempt.x, attempt.direction)
    stepPhysics(caught, attempt.input, [ledge])
    assert.equal(caught.x, attempt.snapX)
    assert.equal(caught.y + caught.h, ledge.y)
    assert.equal(caught.vy, 0)
    assert.equal(caught.vx, 0)
    assert.equal(caught.onGround, true)

    const inward = attempt.direction > 0 ? { left: true } : { right: true }
    stepPhysics(caught, inward, [ledge])
    assert.equal(caught.onGround, true)
    assert.ok((caught.x - attempt.snapX) * attempt.direction < 0)
    for (let frame = 0; frame < 12; frame += 1) stepPhysics(caught, {}, [ledge])
    assert.equal(caught.onGround, true)

    const leaving = fallingAt(attempt.x, attempt.direction)
    stepPhysics(leaving, attempt.input, [ledge])
    stepPhysics(leaving, attempt.input, [ledge])
    assert.equal(leaving.onGround, true)
    stepPhysics(leaving, attempt.input, [ledge])
    assert.equal(leaving.onGround, false)
    let outwardX = leaving.x
    for (let frame = 0; frame < 12; frame += 1) {
      stepPhysics(leaving, attempt.input, [ledge])
      assert.equal(leaving.onGround, false)
      assert.ok((leaving.x - outwardX) * attempt.direction > 0)
      outwardX = leaving.x
    }
  }

  for (const attempt of [
    { x: 106, vx: -2, snapX: 99 },
    { x: -34, vx: 2, snapX: -27 },
  ]) {
    const correcting = createBody({ x: attempt.x, y: 53 })
    Object.assign(correcting, { vx: attempt.vx, vy: 5 })
    stepPhysics(correcting, {}, [ledge])
    assert.equal(correcting.x, attempt.snapX)
    assert.equal(correcting.vx, attempt.vx)
    assert.equal(correcting.onGround, true)
  }

  for (const attempt of [
    { x: 100.7, direction: 1, input: { right: true } },
    { x: -28.7, direction: -1, input: { left: true } },
  ]) {
    const missed = fallingAt(attempt.x, attempt.direction)
    stepPhysics(missed, attempt.input, [ledge])
    assert.equal(missed.onGround, false)
  }
})

test('stomps are distinct from side contact', () => {
  const target = { x: 40, y: 80, w: 30, h: 24 }
  assert.equal(isStomp({ x: 42, y: 35, w: 24, h: 42, vy: 5 }, target), true)
  assert.equal(isSideDamage({ x: 30, y: 70, w: 24, h: 42, vy: 0 }, target), true)
})
