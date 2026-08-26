import { createBody, stepPhysics } from './physics.js'
import { TILE } from '../levels.js'

function runtimeTerrain(level) {
  return level.terrain.map(([, , x, y, width, height]) => ({
    type: height === 1 ? 'oneway' : 'solid',
    x: x * TILE,
    y: y * TILE,
    w: width * TILE,
    h: height * TILE,
  }))
}

function hasLandingAhead(body, terrain) {
  const lookAhead = body.x + body.w + Math.max(22, Math.abs(body.vx) * 7)
  const feet = body.y + body.h
  return terrain.some(rect =>
    lookAhead >= rect.x && lookAhead <= rect.x + rect.w &&
    rect.y >= feet - 4 && rect.y <= feet + 30)
}

export function proveFinishable(level, maxFrames = 3600) {
  const terrain = runtimeTerrain(level)
  const player = createBody({
    x: level.spawn[0] * TILE + 2,
    y: (level.spawn[1] + 1) * TILE - 42,
  })
  const finishX = level.finish[1] * TILE
  let jumpFrames = 0
  let jumps = 0

  for (let frame = 0; frame < maxFrames; frame += 1) {
    const shouldJump = player.onGround && !hasLandingAhead(player, terrain)
    if (shouldJump) {
      jumpFrames = 13
      jumps += 1
    }
    stepPhysics(player, {
      right: true,
      jumpPressed: shouldJump,
      jumpHeld: jumpFrames > 0,
    }, terrain)
    jumpFrames = Math.max(0, jumpFrames - 1)

    if (player.x + player.w >= finishX) return { finishable: true, frames: frame + 1, jumps }
    if (player.y > level.size[1] * TILE + 96) return { finishable: false, frames: frame + 1, jumps, reason: 'fell' }
  }
  return { finishable: false, frames: maxFrames, jumps, reason: 'timeout' }
}
