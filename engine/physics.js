const DEFAULTS = Object.freeze({
  width: 28,
  height: 42,
  runAcceleration: 0.72,
  airAcceleration: 0.42,
  brake: 1.08,
  friction: 0.74,
  maxRun: 5.4,
  gravity: 0.62,
  maxFall: 12.5,
  jumpSpeed: 11.8,
  landingGrace: 6,
  coyoteFrames: 6,
  bufferFrames: 8,
})

const overlap = (body, rect) =>
  body.x < rect.x + rect.w &&
  body.x + body.w > rect.x &&
  body.y < rect.y + rect.h &&
  body.y + body.h > rect.y

export function createBody({ x = 0, y = 0, ...tuning } = {}) {
  const config = { ...DEFAULTS, ...tuning }
  return {
    x,
    y,
    w: config.width,
    h: config.height,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    pose: 'idle',
    config,
  }
}

function moveHorizontal(body, amount, terrain) {
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / 8))
  const step = amount / steps
  for (let index = 0; index < steps; index += 1) {
    body.x += step
    for (const rect of terrain) {
      if (rect.type === 'oneway' || !overlap(body, rect)) continue
      body.x = step > 0 ? rect.x - body.w : rect.x + rect.w
      body.vx = 0
    }
  }
}

function moveVertical(body, amount, terrain, direction) {
  const steps = Math.max(1, Math.ceil(Math.abs(amount) / 8))
  const step = amount / steps
  body.onGround = false
  for (let index = 0; index < steps; index += 1) {
    const previousBottom = body.y + body.h
    body.y += step
    for (const rect of terrain) {
      const catchesOneWayEdge = (!direction || body.coyote === 0) && rect.type === 'oneway' && step > 0 &&
        previousBottom <= rect.y + 1 && body.y + body.h >= rect.y &&
        body.x + body.w >= rect.x - body.config.landingGrace &&
        body.x <= rect.x + rect.w + body.config.landingGrace
      if (!overlap(body, rect) && !catchesOneWayEdge) continue
      if (rect.type === 'oneway' && (step < 0 || previousBottom > rect.y + 1)) continue
      if (step > 0) {
        if (body.x >= rect.x + rect.w) {
          body.x = rect.x + rect.w - 1
          body.vx = Math.min(0, body.vx)
        } else if (body.x + body.w <= rect.x) {
          body.x = rect.x - body.w + 1
          body.vx = Math.max(0, body.vx)
        }
        body.y = rect.y - body.h
        body.vy = 0
        body.onGround = true
      } else if (step < 0 && rect.type !== 'oneway') {
        body.y = rect.y + rect.h
        body.vy = 0
      }
    }
  }
}

export function stepPhysics(body, input = {}, terrain = []) {
  const config = body.config
  body.justJumped = false
  const direction = Number(Boolean(input.right)) - Number(Boolean(input.left))
  const acceleration = body.onGround ? config.runAcceleration : config.airAcceleration

  if (direction) {
    const changingDirection = Math.sign(body.vx) && Math.sign(body.vx) !== direction
    body.vx += direction * (changingDirection ? config.brake : acceleration)
    body.vx = Math.max(-config.maxRun, Math.min(config.maxRun, body.vx))
    body.facing = direction
  } else if (body.onGround) {
    body.vx *= config.friction
    if (Math.abs(body.vx) < 0.08) body.vx = 0
  }

  if (input.jumpPressed) body.jumpBuffer = config.bufferFrames
  else body.jumpBuffer = Math.max(0, body.jumpBuffer - 1)

  if (body.onGround) body.coyote = config.coyoteFrames
  else body.coyote = Math.max(0, body.coyote - 1)

  if (body.jumpBuffer > 0 && body.coyote > 0) {
    body.vy = -config.jumpSpeed
    body.onGround = false
    body.coyote = 0
    body.jumpBuffer = 0
    body.justJumped = true
  }

  body.vy = Math.min(config.maxFall, body.vy + config.gravity)

  moveHorizontal(body, body.vx, terrain)
  moveVertical(body, body.vy, terrain, direction)

  body.pose = !body.onGround
    ? body.vy < 0 ? 'jump' : 'fall'
    : Math.abs(body.vx) > 0.35 ? 'run' : 'idle'
  return body
}

export function isStomp(player, target) {
  const feet = player.y + player.h
  return player.vy > 0 && feet + player.vy >= target.y && feet <= target.y + Math.max(12, player.vy + 4)
}

export function isSideDamage(player, target) {
  return overlap(player, target) && !isStomp(player, target)
}
