import { createBody, isStomp, stepPhysics, type Body, type PhysicsInput, type Rect, type Terrain } from './physics.ts'
import { TILE, type Level, type TerrainKind, type ObjectKind, type EnemyKind, type RegionId, type ObjectTuple } from '../levels.ts'

export interface WorldTerrain extends Terrain {
  id: string
  kind: TerrainKind
  baseY: number
  active: boolean
  timer: number
  phase: number
}

export interface PlacedObject {
  id: string
  x: number
  y: number
}

export interface Collectible extends PlacedObject {
  found: boolean
}

export interface Enemy extends Rect {
  id: string
  kind: EnemyKind
  home: number
  baseY: number
  vx: number
  patrol: number
  alive: boolean
  health: number
  maxHealth: number
  invulnerable: number
  squash: number
}

export interface Gate extends Terrain {
  id: string
  kind: 'gate'
  active: boolean
  open: boolean
}

export interface World {
  level: Level
  width: number
  height: number
  terrain: WorldTerrain[]
  seeds: Collectible[]
  hiddenLights: Collectible[]
  enemies: Enemy[]
  cloak: Collectible[]
  springs: PlacedObject[]
  fans: PlacedObject[]
  switches: (PlacedObject & { targetId: string | null, active: boolean })[]
  gates: Gate[]
  lamps: (PlacedObject & { targetId: string | null, lit: boolean })[]
  checkpoint: (PlacedObject & { active: boolean }) | null
  finish: PlacedObject & { blocked: boolean }
}

export interface Player extends Body {
  spawnX: number
  spawnY: number
  glowing: boolean
  sparkFrames: number
}

export interface Simulation {
  world: World
  player: Player
  frame: number
  finished: boolean
  moved: boolean
  jumped: boolean
  respawns: number
}

export type SimulationCue = 'jump' | 'seed' | 'hidden-light' | 'power' | 'stomp' | 'hurt'
  | 'checkpoint' | 'guardian-hit' | 'guardian-defeated' | 'guardian-locked' | 'finish'

export type SimulationEventType = 'lift' | 'jump' | 'seed' | 'cloak' | 'hidden-light'
  | 'guardian-hit' | 'guardian-defeated' | 'stomp' | 'hurt' | 'spring' | 'fan'
  | 'switch' | 'lamp' | 'crumble' | 'checkpoint' | 'guardian-locked' | 'finish' | 'fall'

export type Burst = [x: number, y: number, color: string]

interface EventDetails {
  enemyKind?: ObjectKind
  enemyId?: string
  contactX?: number
  visual?: boolean
}

interface EventPresentation extends EventDetails {
  cue: SimulationCue | ''
  message: string
  burst: Burst | null
}

export type SimulationEvent = EventPresentation & (
  { type: 'hidden-light', hiddenLightId: string, region: RegionId }
  | { type: Exclude<SimulationEventType, 'hidden-light'>, hiddenLightId?: never, region?: never }
)

const WARDEN_HEALTH = 3
const SEED_SPARK_FRAMES = 240
const SEED_SPARK_BONUS = 90
const SEED_SPARK_MAX = 360

const overlaps = (body: Rect, x: number, y: number, width: number, height: number) =>
  body.x < x + width && body.x + body.w > x && body.y < y + height && body.y + body.h > y

export function createWorld(level: Level): World {
  const checkpoint = level.objects.find(([, kind]) => kind === 'checkpoint')
  const terrain: WorldTerrain[] = level.terrain.map(([id, kind, x, y, width, height], index) => ({
    id,
    kind,
    type: height === 1 ? 'oneway' : 'solid',
    x: x * TILE,
    y: y * TILE,
    baseY: y * TILE,
    w: width * TILE,
    h: height * TILE,
    active: kind !== 'bridge',
    timer: 0,
    phase: index * 1.37,
  }))
  const bridges = terrain.filter(item => item.kind === 'bridge')
  const gates: Gate[] = level.objects
    .filter(([, kind]) => kind === 'gate')
    .map(([id,, x, y]) => ({
      id,
      kind: 'gate',
      type: 'solid',
      x: x * TILE,
      y: (y - 3) * TILE,
      w: TILE,
      h: 4 * TILE,
      active: true,
      open: false,
    }))
  return {
    level,
    width: level.size[0] * TILE,
    height: level.size[1] * TILE,
    terrain,
    seeds: level.objects
      .filter(([, kind]) => kind === 'seed')
      .map(([id,, x, y]) => ({ id, x: (x + .5) * TILE, y: (y + .45) * TILE, found: false })),
    hiddenLights: level.objects
      .filter(([, kind]) => kind === 'hidden-light')
      .map(([id,, x, y]) => ({ id, x: (x + .5) * TILE, y: (y + 1) * TILE, found: false })),
    enemies: level.objects
      .filter((object): object is ObjectTuple<EnemyKind> => ['mossling', 'drizzlet', 'gearling', 'mothlight', 'sentry', 'warden'].includes(object[1]))
      .map(([id, kind, x, y]) => {
        const w = kind === 'warden' ? 54 : kind === 'sentry' ? 40 : 36
        const h = kind === 'warden' ? 44 : kind === 'sentry' ? 32 : 28
        const home = (x + .5) * TILE - w / 2
        const baseY = (y + 1) * TILE - h
        const maxHealth = kind === 'warden' ? WARDEN_HEALTH : 1
        return {
          id,
          kind,
          x: home,
          y: baseY,
          w,
          h,
          home,
          baseY,
          vx: kind === 'sentry' ? -1 : kind === 'warden' ? -.82 : kind === 'mothlight' ? -.72 : -.55,
          patrol: kind === 'sentry' ? 82 : kind === 'warden' ? 110 : 52,
          alive: true,
          health: maxHealth,
          maxHealth,
          invulnerable: 0,
          squash: 0,
        }
      }),
    cloak: level.objects
      .filter(([, kind]) => kind === 'cloak')
      .map(([id,, x, y]) => ({ id, x: (x + .5) * TILE, y: (y + .4) * TILE, found: false })),
    springs: level.objects
      .filter(([, kind]) => kind === 'spring')
      .map(([id,, x, y]) => ({ id, x: (x + .5) * TILE, y: (y + 1) * TILE })),
    fans: level.objects
      .filter(([, kind]) => kind === 'fan')
      .map(([id,, x, y]) => ({ id, x: (x + .5) * TILE, y: (y + 1) * TILE })),
    switches: level.objects
      .filter(([, kind]) => kind === 'switch')
      .map(([id,, x, y], index) => ({
        id,
        x: (x + .5) * TILE,
        y: (y + 1) * TILE,
        targetId: bridges[index]?.id || null,
        active: false,
      })),
    gates,
    lamps: level.objects
      .filter(([, kind]) => kind === 'lamp')
      .map(([id,, x, y], index) => ({
        id,
        x: (x + .5) * TILE,
        y: (y + 1) * TILE,
        targetId: gates[index]?.id || null,
        lit: false,
      })),
    checkpoint: checkpoint ? {
      id: checkpoint[0],
      x: (checkpoint[2] + .5) * TILE,
      y: (checkpoint[3] + 1) * TILE,
      active: false,
    } : null,
    finish: { id: level.finish[0], x: level.finish[1] * TILE, y: level.finish[2] * TILE, blocked: false },
  }
}

export function createPlayer(level: Level): Player {
  const [spawnX, spawnY] = level.spawn
  const player = createBody({ x: spawnX * TILE + 2, y: (spawnY + 1) * TILE - 42 })
  return Object.assign(player, {
    spawnX: player.x,
    spawnY: player.y,
    glowing: false,
    sparkFrames: 0,
  })
}

export function createSimulation(level: Level): Simulation {
  return {
    world: createWorld(level),
    player: createPlayer(level),
    frame: 0,
    finished: false,
    moved: false,
    jumped: false,
    respawns: 0,
  }
}

export function guardianState(world: Pick<World, 'enemies'>) {
  const guardian = world.enemies.find(enemy => enemy.kind === 'warden')
  return {
    guardianHealth: guardian?.health || 0,
    guardianMax: guardian?.maxHealth || 0,
    guardianDefeated: Boolean(guardian && !guardian.alive),
  }
}

export function advanceEnemy(enemy: Enemy, frame = 0) {
  if (enemy.squash > 0) enemy.squash -= 1
  if (!enemy.alive) return enemy
  if (enemy.invulnerable > 0) enemy.invulnerable -= 1

  enemy.x += enemy.vx
  const left = enemy.home - enemy.patrol
  const right = enemy.home + enemy.patrol
  if (enemy.x <= left && enemy.vx < 0) {
    enemy.x = left
    enemy.vx = Math.abs(enemy.vx)
  } else if (enemy.x >= right && enemy.vx > 0) {
    enemy.x = right
    enemy.vx = -Math.abs(enemy.vx)
  }
  if (enemy.kind === 'mothlight') enemy.y = enemy.baseY - 24 + Math.sin(frame * .08 + enemy.home) * 15
  return enemy
}

export function strikeEnemy(enemy: Enemy) {
  if (!enemy.alive || enemy.invulnerable > 0) return { hit: false, defeated: !enemy.alive }
  enemy.health = Math.max(0, enemy.health - 1)
  enemy.alive = enemy.health > 0
  if (enemy.alive) enemy.invulnerable = 22
  else enemy.squash = enemy.kind === 'warden' ? 40 : 28
  return { hit: true, defeated: !enemy.alive }
}

export function enemyAttackLands(player: Pick<Player, 'y' | 'h' | 'vy' | 'glowing' | 'sparkFrames'>, enemy: Enemy) {
  return isStomp(player, enemy) || (enemy.kind !== 'warden' && (player.glowing || player.sparkFrames > 0))
}

export function finishOutcome(world: Pick<World, 'finish' | 'enemies'>, player: Rect) {
  const bell = world.finish
  if (!overlaps(player, bell.x - 6, bell.y - 48, 44, 72)) {
    bell.blocked = false
    return ''
  }
  if (world.enemies.some(enemy => enemy.kind === 'warden' && enemy.alive)) {
    if (bell.blocked) return ''
    bell.blocked = true
    return 'locked'
  }
  bell.blocked = false
  return 'finished'
}

export function activateSwitches(world: Pick<World, 'switches' | 'terrain'>, player: Rect) {
  let changed = false
  for (const item of world.switches) {
    if (item.active || !overlaps(player, item.x - 20, item.y - 30, 40, 30)) continue
    item.active = true
    const bridge = world.terrain.find(rect => rect.id === item.targetId)
    if (bridge) bridge.active = true
    changed = true
  }
  return changed
}

export function activateLamps(world: Pick<World, 'lamps' | 'gates'>, player: Rect) {
  let changed = false
  for (const lamp of world.lamps) {
    if (lamp.lit || !overlaps(player, lamp.x - 20, lamp.y - 52, 40, 52)) continue
    lamp.lit = true
    const gate = world.gates.find(item => item.id === lamp.targetId)
    if (gate) {
      gate.active = false
      gate.open = true
    }
    changed = true
  }
  return changed
}

export function activateCheckpoint(world: Pick<World, 'checkpoint'>, player: Player) {
  const checkpoint = world.checkpoint
  if (!checkpoint || checkpoint.active || !overlaps(player, checkpoint.x - 14, checkpoint.y - 52, 28, 52)) return false
  checkpoint.active = true
  player.spawnX = checkpoint.x - player.w / 2
  player.spawnY = checkpoint.y - player.h
  return true
}

function resetPlayer(simulation: Simulation) {
  const { player } = simulation
  Object.assign(player, {
    x: player.spawnX, y: player.spawnY, vx: 0, vy: 0,
    onGround: false, coyote: 0, jumpBuffer: 0, justJumped: false, pose: 'idle', sparkFrames: 0,
  })
  simulation.respawns += 1
}

export function stepSimulation(simulation: Simulation, input: PhysicsInput = {}): SimulationEvent[] {
  if (simulation.finished) return []
  const { world, player, frame } = simulation
  const events: SimulationEvent[] = []
  const emit = (type: Exclude<SimulationEventType, 'hidden-light'>, cue: SimulationCue | '' = '', message = '', burst: Burst | null = null, extra: EventDetails = {}) =>
    events.push({ type, cue, message, burst, ...extra })

  if (player.sparkFrames > 0) player.sparkFrames -= 1

  for (const rect of world.terrain) {
    if (rect.kind !== 'lift' || !rect.active) continue
    const previousY = rect.y
    rect.y = rect.baseY + Math.sin(frame * .025 + rect.phase) * 24
    const riding = player.onGround && Math.abs(player.y + player.h - previousY) < 3 &&
      player.x + player.w > rect.x && player.x < rect.x + rect.w
    if (riding) {
      player.y += rect.y - previousY
      emit('lift')
    }
  }

  const support = world.terrain.find(rect => rect.active && Math.abs(player.y + player.h - rect.y) < 3 &&
    player.x + player.w > rect.x && player.x < rect.x + rect.w)
  player.config.friction = support?.kind === 'slick' ? .94 : .74
  player.config.brake = support?.kind === 'slick' ? .42 : 1.08
  stepPhysics(player, input, [...world.terrain, ...world.gates].filter(rect => rect.active))
  if (player.justJumped) {
    simulation.jumped = true
    emit('jump', 'jump')
  }
  if (Math.abs(player.vx) > .25 || !player.onGround) simulation.moved = true
  if (support?.kind === 'belt') player.x += .85

  for (const seed of world.seeds) {
    if (seed.found || !overlaps(player, seed.x - 12, seed.y - 15, 24, 30)) continue
    seed.found = true
    const alreadySparked = player.sparkFrames > 0
    if (!player.glowing) player.sparkFrames = Math.min(SEED_SPARK_MAX, player.sparkFrames + SEED_SPARK_FRAMES)
    emit(
      'seed',
      'seed',
      player.glowing ? 'LANTERN SEED!' : alreadySparked ? 'SEED SPARK REFILLED!' : 'SEED SPARK · BUMP CREATURES!',
      [seed.x, seed.y, '#FFD563'],
    )
  }

  for (const cloak of world.cloak) {
    if (cloak.found || !overlaps(player, cloak.x - 18, cloak.y - 25, 36, 50)) continue
    cloak.found = true
    player.glowing = true
    player.sparkFrames = 0
    emit('cloak', 'power', 'GLOW CLOAK · POWER STAYS ON!', [cloak.x, cloak.y, '#B8F4BD'])
  }

  for (const hiddenLight of world.hiddenLights) {
    if (hiddenLight.found || !overlaps(player, hiddenLight.x - 18, hiddenLight.y - 50, 36, 50)) continue
    hiddenLight.found = true
    events.push({
      type: 'hidden-light',
      cue: 'hidden-light',
      message: 'HIDDEN LIGHT FOUND!',
      burst: [hiddenLight.x, hiddenLight.y - 28, '#FFE377'],
      hiddenLightId: hiddenLight.id,
      region: world.level.region,
    })
  }

  for (const enemy of world.enemies) {
    advanceEnemy(enemy, frame)
    if (!enemy.alive || enemy.invulnerable > 0 || !overlaps(player, enemy.x, enemy.y, enemy.w, enemy.h)) continue
    if (enemyAttackLands(player, enemy)) {
      const result = strikeEnemy(enemy)
      if (!result.hit) continue
      player.vy = enemy.kind === 'warden' ? -9.2 : -7.8
      const burst: Burst = [enemy.x + enemy.w / 2, enemy.y + 8, enemy.kind === 'warden' ? '#FFE377' : '#A8D969']
      if (enemy.kind === 'warden') {
        emit(
          result.defeated ? 'guardian-defeated' : 'guardian-hit',
          result.defeated ? 'guardian-defeated' : 'guardian-hit',
          result.defeated ? 'WARDEN DOWN · RING THE BELL!' : `WARDEN · ${enemy.health} LIGHTS LEFT`,
          burst,
          { enemyKind: enemy.kind },
        )
      } else {
        const sparkBump = !player.glowing && player.sparkFrames > 0
        if (sparkBump) player.sparkFrames = Math.min(SEED_SPARK_MAX, player.sparkFrames + SEED_SPARK_BONUS)
        emit('stomp', 'stomp', player.glowing ? 'GLOW BUMP!' : sparkBump ? 'SPARK EXTENDED!' : 'BOUNCE!', burst, { enemyKind: enemy.kind })
      }
    } else {
      const contactX = player.x
      resetPlayer(simulation)
      emit('hurt', 'hurt', 'OOPS · TRY AGAIN!', null, { enemyKind: enemy.kind, enemyId: enemy.id, contactX })
    }
  }

  for (const spring of world.springs) {
    if (player.vy < 0 || !overlaps(player, spring.x - 18, spring.y - 14, 36, 16)) continue
    player.vy = -13.2
    player.onGround = false
    emit('spring', 'power', 'LEAF SPRING!', [spring.x, spring.y - 8, '#C9F58C'])
  }

  for (const fan of world.fans) {
    const center = player.x + player.w / 2
    if (Math.abs(center - fan.x) >= 52 || player.y + player.h >= fan.y || player.y + player.h <= fan.y - 175) continue
    player.vy = Math.max(-8.4, player.vy - .48)
    if (frame % 12 === 0) emit('fan', '', '', [fan.x + (frame % 3 - 1) * 18, fan.y - 20, '#B8E9F2'], { visual: true })
  }

  if (activateSwitches(world, player)) {
    emit('switch', 'checkpoint', 'BRIDGE ON!', [player.x + player.w / 2, player.y + player.h, '#FFD563'])
  }

  if (activateLamps(world, player)) {
    const message = world.gates.some(gate => gate.open) ? 'LAMP LIT · GATE OPEN!' : 'LAMP LIT!'
    emit('lamp', 'power', message, [player.x + player.w / 2, player.y + player.h - 30, '#FFE377'])
  }

  for (const rect of world.terrain) {
    if (rect.kind !== 'crumble') continue
    if (!rect.active) {
      rect.timer -= 1
      if (rect.timer <= 0) {
        rect.active = true
        rect.timer = 0
      }
      continue
    }
    const standing = player.onGround && Math.abs(player.y + player.h - rect.y) < 2 &&
      player.x + player.w > rect.x && player.x < rect.x + rect.w
    rect.timer = standing ? rect.timer + 1 : Math.max(0, rect.timer - 2)
    if (rect.timer > 42) {
      rect.active = false
      rect.timer = 120
      player.onGround = false
      emit('crumble', '', '', [player.x + player.w / 2, rect.y, '#C79458'])
    }
  }

  if (activateCheckpoint(world, player)) {
    emit('checkpoint', 'checkpoint', 'LANTERN LIT · CHECKPOINT!', [world.checkpoint!.x, world.checkpoint!.y - 30, '#A9F0B2'])
  }

  const finish = finishOutcome(world, player)
  if (finish === 'locked') {
    emit('guardian-locked', 'guardian-locked', 'THE WARDEN GUARDS THE BELL')
  } else if (finish === 'finished') {
    simulation.finished = true
    emit('finish', 'finish', 'TRAIL CLEARED!', [world.finish.x + 16, world.finish.y - 28, '#FFF4B0'])
  }

  if (player.y > world.height + 96) {
    resetPlayer(simulation)
    emit('fall', 'hurt', world.checkpoint?.active ? 'BACK TO THE LANTERN' : 'TRY THAT JUMP AGAIN')
  }

  simulation.frame += 1
  return events
}
