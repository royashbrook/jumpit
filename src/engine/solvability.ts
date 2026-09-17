import { createSimulation, stepSimulation, type Simulation, type SimulationEvent } from './simulation.ts'
import type { PhysicsInput } from './physics.ts'
import type { Level } from '../levels.ts'

const INPUT = Object.freeze({ left: 1, right: 2, jumpPressed: 4 })

const encodeInput = (input: PhysicsInput) =>
  (input.left ? INPUT.left : 0) |
  (input.right ? INPUT.right : 0) |
  (input.jumpPressed ? INPUT.jumpPressed : 0)

const decodeInput = (value: number) => ({
  left: Boolean(value & INPUT.left),
  right: Boolean(value & INPUT.right),
  jumpPressed: Boolean(value & INPUT.jumpPressed),
})

function hasLandingAhead(simulation: Simulation) {
  const { player, world } = simulation
  const lookAhead = player.x + player.w + Math.max(22, Math.abs(player.vx) * 7)
  const feet = player.y + player.h
  return [...world.terrain, ...world.gates].some(rect =>
    rect.active && lookAhead >= rect.x && lookAhead <= rect.x + rect.w &&
    rect.y >= feet - 4 && rect.y <= feet + 30)
}

function dangerAhead(simulation: Simulation, direction: number) {
  const { player, world } = simulation
  const center = player.x + player.w / 2
  return world.enemies.some(enemy => {
    if (!enemy.alive) return false
    const distance = enemy.x + enemy.w / 2 - center
    return Math.sign(distance) === direction && Math.abs(distance) < (enemy.kind === 'warden' ? 160 : 190)
  })
}

function nextInput(simulation: Simulation, memory: { jumps: number, sawCrumble: boolean }, seekHiddenLight = false) {
  const { player, world } = simulation
  const crumbleUnderfoot = world.level.introduces.includes('crumble-banks') && world.terrain.find(rect =>
    rect.kind === 'crumble' && rect.active && player.onGround &&
    Math.abs(player.y + player.h - rect.y) < 3 &&
    player.x + player.w > rect.x && player.x < rect.x + rect.w)
  const witnessingCrumble = !memory.sawCrumble && Boolean(crumbleUnderfoot)
  const guardian = world.enemies.find(enemy => enemy.kind === 'warden' && enemy.alive)
  const center = player.x + player.w / 2
  const guardianDistance = guardian ? guardian.x + guardian.w / 2 - center : 0
  const hiddenLight = seekHiddenLight ? world.hiddenLights.find(item => !item.found) : null
  const hiddenLightDistance = hiddenLight ? hiddenLight.x - center : Infinity
  const hiddenLightAhead = Boolean(hiddenLight && hiddenLightDistance > 5 && hiddenLightDistance < 155 &&
    hiddenLight.y < player.y + player.h)
  const direction = witnessingCrumble
    ? 0
    : guardian && (world.finish.blocked || center > guardian.home - 150)
      ? Math.abs(guardianDistance) < 12 ? 0 : Math.sign(guardianDistance)
      : 1
  const shouldJump = !witnessingCrumble && player.onGround && (
    !hasLandingAhead(simulation) ||
    dangerAhead(simulation, direction || 1) ||
    (guardian && Math.abs(guardianDistance) < 150) ||
    hiddenLightAhead
  )

  if (shouldJump) {
    memory.jumps += 1
  }
  return {
    left: direction < 0,
    right: direction > 0,
    jumpPressed: shouldJump,
  }
}

function stateVector(simulation: Simulation, events: readonly SimulationEvent[]) {
  const { world, player } = simulation
  return [
    simulation.frame,
    Number(simulation.finished),
    simulation.respawns,
    player.x, player.y, player.vx, player.vy, Number(player.onGround), player.coyote,
    player.jumpBuffer, Number(player.glowing), player.sparkFrames, player.spawnX, player.spawnY,
    ...world.terrain.flatMap(rect => [rect.id, rect.y, Number(rect.active), rect.timer]),
    ...world.seeds.flatMap(seed => [seed.id, Number(seed.found)]),
    ...world.hiddenLights.flatMap(hiddenLight => [hiddenLight.id, Number(hiddenLight.found)]),
    ...world.enemies.flatMap(enemy => [enemy.id, enemy.x, enemy.y, enemy.vx, Number(enemy.alive), enemy.health, enemy.invulnerable, enemy.squash]),
    ...world.switches.flatMap(item => [item.id, Number(item.active)]),
    ...world.gates.flatMap(gate => [gate.id, Number(gate.active), Number(gate.open)]),
    ...world.lamps.flatMap(lamp => [lamp.id, Number(lamp.lit)]),
    Number(world.checkpoint?.active),
    Number(world.finish.blocked),
    ...events.map(event => event.type),
  ]
}

function hashFrame(hash: number, simulation: Simulation, events: readonly SimulationEvent[]) {
  const text = JSON.stringify(stateVector(simulation, events))
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function runReplay(level: Level, inputs: readonly number[]) {
  const simulation = createSimulation(level)
  const eventCounts: Record<string, number> = {}
  const eventFrames: Record<string, number[]> = {}
  let hash = 2166136261
  let maxX = simulation.player.x
  for (const encoded of inputs) {
    const events = stepSimulation(simulation, decodeInput(encoded))
    for (const event of events) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1
      const frames = eventFrames[event.type] ||= []
      frames.push(simulation.frame)
    }
    hash = hashFrame(hash, simulation, events)
    maxX = Math.max(maxX, simulation.player.x)
    if (simulation.finished) break
  }
  return {
    finishable: simulation.finished,
    frames: simulation.frame,
    respawns: simulation.respawns,
    maxX,
    events: eventCounts,
    eventFrames,
    hash: hash.toString(16).padStart(8, '0'),
    simulation,
  }
}

function record(level: Level, maxFrames: number, seekHiddenLight: boolean) {
  const simulation = createSimulation(level)
  const memory = { jumps: 0, sawCrumble: false }
  const inputs: number[] = []
  for (let frame = 0; frame < maxFrames && !simulation.finished; frame += 1) {
    const input = nextInput(simulation, memory, seekHiddenLight)
    inputs.push(encodeInput(input))
    const events = stepSimulation(simulation, input)
    if (events.some(event => event.type === 'crumble')) memory.sawCrumble = true
  }
  const replay = runReplay(level, inputs)
  return {
    ...replay,
    jumps: memory.jumps,
    inputs,
    reason: replay.finishable ? '' : simulation.respawns ? 'timeout after respawns' : 'timeout',
  }
}

export function recordReplay(level: Level, maxFrames = 7200) {
  return record(level, maxFrames, false)
}

export function recordHiddenLightReplay(level: Level, maxFrames = 7200) {
  return record(level, maxFrames, true)
}

export function replayLevel(level: Level, inputs: readonly number[]) {
  return runReplay(level, inputs)
}

export function proveFinishable(level: Level, maxFrames = 7200) {
  const recorded = recordReplay(level, maxFrames)
  const replayed = replayLevel(level, recorded.inputs)
  return {
    finishable: recorded.finishable && replayed.finishable && recorded.hash === replayed.hash,
    frames: replayed.frames,
    jumps: recorded.jumps,
    respawns: replayed.respawns,
    events: replayed.events,
    hash: replayed.hash,
    replayFrames: recorded.inputs.length,
    reason: replayed.finishable ? '' : recorded.reason,
  }
}
