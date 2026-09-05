import { LEVELS, REGIONS, TILE } from './levels.js?v=2'
import {
  createSimulation,
  guardianState,
  stepSimulation,
} from './engine/simulation.js?v=3'

export {
  activateCheckpoint,
  activateLamps,
  activateSwitches,
  advanceEnemy,
  createWorld as makeWorld,
  enemyAttackLands,
  finishOutcome,
  guardianState,
  strikeEnemy,
} from './engine/simulation.js?v=3'

const WORLD_HEIGHT = 18 * TILE
const MAX_VIEW_WIDTH = 28 * TILE
const BACKGROUND_PAN_MARGIN = .08
const FIXED_STEP = 1000 / 60
const RESPAWN_FRAMES = 42
const COACH_FRAMES = 120
const HINT_TOP = 96
const PLAYER_FRAMES = { idle: 0, run: 1, jump: 4, fall: 5 }
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

export function cameraScale(width, height) {
  return Math.max(height / WORLD_HEIGHT, width / MAX_VIEW_WIDTH)
}

export function cameraTarget({ playerX, direction = 0, viewWidth, worldWidth, reducedMotion = false }) {
  const anchor = reducedMotion ? .5 : .5 - clamp(direction, -1, 1) * .2
  return clamp(playerX - viewWidth * anchor, 0, Math.max(0, worldWidth - viewWidth))
}

export function verticalCameraTarget({ playerY, playerHeight, viewHeight }) {
  return clamp(playerY + playerHeight - viewHeight * .7, 0, Math.max(0, WORLD_HEIGHT - viewHeight))
}

export function cameraProgress(camera, worldWidth, viewWidth) {
  return clamp(camera / Math.max(1, worldWidth - viewWidth), 0, 1)
}

export function backgroundCrop({ imageWidth, rowHeight, width, height, progress }) {
  const destinationAspect = width / height
  const sourceWidth = Math.min(imageWidth * (1 - BACKGROUND_PAN_MARGIN), rowHeight * destinationAspect)
  const sourceHeight = sourceWidth / destinationAspect
  return {
    x: (imageWidth - sourceWidth) * clamp(progress, 0, 1),
    y: (rowHeight - sourceHeight) / 2,
    width: sourceWidth,
    height: sourceHeight,
  }
}

export const ART_SOURCES = Object.freeze({
  gardenBackground: 'assets/backgrounds/garden-walk.webp',
  regionBackground: 'assets/backgrounds/region-atlas.webp',
  finalBackground: 'assets/backgrounds/final-atlas.webp',
  courier: 'assets/sprites/courier-sheet.webp',
  world: 'assets/sprites/world-sheet.webp',
  region: 'assets/sprites/region-sheet.webp',
  final: 'assets/sprites/final-sheet.webp',
})

export function artKeysForLevel(level) {
  const keys = ['courier']
  if (level.region === 'garden') return [...keys, 'gardenBackground', 'world']
  if (['rooftop', 'workshop'].includes(level.region)) return [...keys, 'regionBackground', 'region']
  keys.push('finalBackground', 'final')
  if (level.objects.some(([, kind]) => kind === 'fan')) keys.push('region')
  return keys
}

export function coachMessage({ moved, jumped, glowing, sparkFrames = 0, x, frame = 0 }) {
  if (frame < COACH_FRAMES && !moved) return 'SLIDE TO RUN'
  if (frame < COACH_FRAMES && !jumped) return 'TAP RIGHT TO JUMP'
  if (sparkFrames > 0 && x < 620) return 'SPARK BUMPS CREATURES'
  if (glowing && x < 620) return 'GLOW BUMPS CREATURES'
  return ''
}

export function playHint({ finished, moved, jumped, glowing, sparkFrames = 0, x, y, finishX, finishY, frame = 0 }) {
  if (finished) return { kind: 'none', text: '' }
  const coach = coachMessage({ moved, jumped, glowing, sparkFrames, x, frame })
  if (coach) return { kind: 'coach', text: coach }
  if (Math.abs(finishX - x) < TILE * 2 && Math.abs(finishY - y) > TILE) {
    return { kind: 'guide', text: finishY > y ? 'BELL ↓' : 'BELL ↑' }
  }
  return { kind: 'none', text: '' }
}

export function impactFeedback(type, reducedMotion = false) {
  if (!['seed', 'stomp', 'checkpoint', 'finish', 'hidden-light'].includes(type)) return null
  return {
    frames: type === 'hidden-light' ? 48 : type === 'finish' ? 12 : 9,
    kick: reducedMotion || type === 'hidden-light' ? 0 : type === 'finish' || type === 'checkpoint' ? 5 : 3,
    expands: !reducedMotion,
  }
}

export function sparkGlowBright(sparkFrames, animationFrame) {
  return sparkFrames > 60 || (sparkFrames > 0 && Math.floor(animationFrame / 6) % 2 === 0)
}

export function drawPowerAura(context, subject, animationFrame, width, height) {
  if (!subject.glowing && !(subject.sparkFrames > 0)) return false
  const sparkBright = subject.glowing || sparkGlowBright(subject.sparkFrames, animationFrame)
  context.shadowColor = subject.glowing ? '#D4FF9D' : '#FFD563'
  context.shadowBlur = sparkBright ? 18 : 4
  context.fillStyle = subject.glowing
    ? 'rgb(213 255 165 / .28)'
    : sparkBright ? 'rgb(255 213 99 / .32)' : 'rgb(255 213 99 / .1)'
  context.beginPath()
  context.ellipse(0, -height * .45, width * .38, height * .48, 0, 0, Math.PI * 2)
  context.fill()
  return true
}

export function terrainVisible(rect, cameraLeft, cameraTop, viewWidth, viewHeight) {
  const margin = TILE * 2
  return rect.x + rect.w >= cameraLeft - margin && rect.x <= cameraLeft + viewWidth + margin &&
    rect.y + rect.h >= cameraTop - margin && rect.y <= cameraTop + viewHeight + margin
}

export function keyInputMode({ type, running, paused, finished, respawning = false }) {
  if (!running) return 'ignore'
  if (paused || finished || respawning) return type === 'keyup' ? 'release' : 'ignore'
  return 'control'
}

export function interactiveKeyTarget(target, code) {
  return code === 'Space' && Boolean(target?.closest?.('button, a[href], input, select, textarea, summary, [contenteditable]'))
}

export function setInputState(input, action, pressed) {
  if (action === 'jump') {
    if (pressed && !input.jumpHeld) input.jumpPressed = true
    input.jumpHeld = pressed
  } else if (action in input) input[action] = pressed
}

export function clearInputState(input, player) {
  input.left = false
  input.right = false
  input.jumpHeld = false
  input.jumpPressed = false
  player.jumpBuffer = 0
}

export function createGame(canvas, onState = () => {}, onCue = () => {}) {
  const context = canvas.getContext('2d')
  const art = Object.fromEntries(Object.entries(ART_SOURCES).map(([key, source]) => [key, { source, image: new Image() }]))
  const background = art.gardenBackground.image
  const regionAtlas = art.regionBackground.image
  const finalAtlas = art.finalBackground.image
  const courier = art.courier.image
  const worldSheet = art.world.image
  const regionSheet = art.region.image
  const finalSheet = art.final.image
  const reducedMotion = Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const input = { left: false, right: false, jumpHeld: false, jumpPressed: false }
  const inputSources = {
    left: new Set(),
    right: new Set(),
    jump: new Set(),
  }
  const particles = []
  let impact = null
  let cameraKick = 0
  let respawn = null
  let simulation = createSimulation(LEVELS[0])
  let world = simulation.world
  let player = simulation.player
  let camera = 0
  let cameraY = 0
  let cameraViewWidth = 320
  let cameraViewHeight = WORLD_HEIGHT
  let cameraReady = false
  let cameraDirection = 0
  let running = false
  let paused = false
  let finished = simulation.finished
  let moved = simulation.moved
  let jumped = simulation.jumped
  let frame = simulation.frame
  let lastTime = 0
  let accumulator = 0
  let raf = 0
  let knownHiddenLights = []

  function loadArt(level) {
    const needed = new Set(artKeysForLevel(level))
    for (const [key, item] of Object.entries(art)) {
      if (!needed.has(key)) {
        if (item.image.src) {
          if (typeof item.image.removeAttribute === 'function') item.image.removeAttribute('src')
          else item.image.src = ''
        }
        continue
      }
      if (!(item.image.src || '').endsWith(item.source)) item.image.src = item.source
      item.image.decode?.().catch(() => {})
    }
  }

  function syncSimulation() {
    world = simulation.world
    player = simulation.player
    finished = simulation.finished
    moved = simulation.moved
    jumped = simulation.jumped
    frame = simulation.frame
  }

  function report(message = '', { hiddenLightId = null } = {}) {
    const region = REGIONS.find(item => item.id === world.level.region)
    const seeds = world.seeds.filter(seed => seed.found).length
    onState({
      levelId: world.level.id,
      levelName: world.level.name,
      regionName: region?.name || world.level.region,
      seeds,
      maxSeeds: world.seeds.length,
      paused,
      finished,
      respawning: Boolean(respawn),
      message,
      hiddenLightId,
      ...guardianState(world),
    })
  }

  function burst(x, y, color = '#FFD563') {
    const amount = reducedMotion ? 4 : 10
    for (let index = 0; index < amount; index += 1) {
      const angle = (Math.PI * 2 * index) / amount
      particles.push({ x, y, vx: Math.cos(angle) * (1.5 + index % 3), vy: Math.sin(angle) * 2.2 - 1, life: 34, color })
    }
  }

  function advanceFeedback() {
    for (const particle of particles) {
      particle.x += particle.vx
      particle.y += particle.vy
      particle.vy += 0.12
      particle.life -= 1
    }
    while (particles[0]?.life <= 0) particles.shift()
    if (impact) {
      impact.life -= 1
      if (impact.life <= 0) impact = null
    }
    cameraKick = Math.max(0, cameraKick - .7)
  }

  function resetFeedback() {
    particles.length = 0
    impact = null
    cameraKick = 0
    respawn = null
  }

  function update() {
    if (paused) return
    if (finished) return advanceFeedback()
    if (respawn) {
      respawn.life -= 1
      if (respawn.life === RESPAWN_FRAMES / 2) {
        respawn.player = null
        cameraReady = false
      }
      if (respawn.life <= 0) {
        respawn = null
        report('')
      }
      return advanceFeedback()
    }
    const inputDirection = Number(input.right) - Number(input.left)
    if (inputDirection) cameraDirection += (inputDirection - cameraDirection) * .12
    const previousPlayer = { ...player }
    const events = stepSimulation(simulation, input)
    input.jumpPressed = false
    syncSimulation()

    for (const event of events) {
      if (event.type === 'hidden-light' && !knownHiddenLights.includes(event.hiddenLightId)) {
        knownHiddenLights.push(event.hiddenLightId)
      }
      if (event.type === 'fan' && event.burst) {
        particles.push({ x: event.burst[0], y: event.burst[1], vx: 0, vy: -2.1, life: 28, color: event.burst[2] })
      } else if (event.burst) burst(...event.burst)
      const feedback = impactFeedback(event.type, reducedMotion)
      if (feedback && event.burst) {
        impact = {
          x: event.burst[0],
          y: event.burst[1],
          color: event.burst[2],
          life: feedback.frames,
          maxLife: feedback.frames,
          expands: feedback.expands,
        }
        cameraKick = Math.max(cameraKick, feedback.kick)
      }
      if (event.type === 'hurt' || event.type === 'fall') {
        respawn = { life: RESPAWN_FRAMES, player: previousPlayer }
        clearInput()
        cameraDirection = 0
      }
      if (event.cue) onCue(event.cue)
      if (event.message) report(event.message, event)
    }

    advanceFeedback()
  }

  function drawBackground(width, height, viewWidth) {
    const region = world.level.region
    const atlasRow = ['rooftop', 'market'].includes(region) ? 0 : ['workshop', 'keep'].includes(region) ? 1 : -1
    const image = ['market', 'keep'].includes(region) ? finalAtlas : atlasRow >= 0 ? regionAtlas : background
    if (image.complete && image.naturalWidth) {
      const progress = cameraProgress(camera, world.width, viewWidth)
      const rowHeight = atlasRow >= 0 ? image.naturalHeight / 2 : image.naturalHeight
      const crop = backgroundCrop({
        imageWidth: image.naturalWidth,
        rowHeight,
        width,
        height,
        progress,
      })
      const sourceY = (atlasRow >= 0 ? atlasRow * rowHeight : 0) + crop.y
      context.drawImage(image, crop.x, sourceY, crop.width, crop.height, 0, 0, width, height)
      context.fillStyle = 'rgb(255 250 224 / .08)'
      context.fillRect(0, 0, width, height)
      return
    }
    const sky = context.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#76CFCB')
    sky.addColorStop(1, '#F7DFA7')
    context.fillStyle = sky
    context.fillRect(0, 0, width, height)
  }

  function terrainPalette(kind) {
    if (kind === 'leaf') return ['#386B45', '#8ECF68', '#234A37']
    if (kind === 'crumble') return ['#8B5C3D', '#D1A257', '#5B3F31']
    if (['roof', 'slick', 'awning'].includes(kind)) return ['#344957', kind === 'slick' ? '#72B3C3' : '#8E6A55', '#1F3038']
    if (['wood', 'belt', 'lift', 'bridge'].includes(kind)) return ['#765136', kind === 'belt' ? '#3F9993' : '#D09B50', '#402E25']
    if (['stall', 'lantern', 'shade'].includes(kind)) return ['#573A4E', kind === 'lantern' ? '#E4A84A' : '#9A5A72', '#31273A']
    if (['stone', 'beacon'].includes(kind)) return ['#46504C', kind === 'beacon' ? '#D5A649' : '#78907A', '#293632']
    return ['#72513A', '#8BC65A', '#3F372C']
  }

  function drawTerrain(rect) {
    if (!rect.active) return
    const [soil, moss, line] = terrainPalette(rect.kind)
    const shake = rect.kind === 'crumble' && rect.timer > 24 ? Math.sin(frame * 1.8) * 2 : 0
    const natural = ['ground', 'leaf', 'crumble', 'stone', 'beacon'].includes(rect.kind)
    const radius = Math.min(7, rect.w / 4, rect.h / 4)
    const cap = Math.min(natural ? 15 : 11, rect.h)
    const right = rect.x + rect.w
    context.save()
    context.translate(shake, 0)
    context.lineJoin = 'round'
    const face = context.createLinearGradient(0, rect.y, 0, rect.y + rect.h)
    face.addColorStop(0, soil)
    face.addColorStop(.58, soil)
    face.addColorStop(1, line)
    context.fillStyle = face
    context.strokeStyle = line
    context.lineWidth = 2
    context.beginPath()
    if (natural) {
      const bottom = rect.y + rect.h
      context.moveTo(rect.x, rect.y)
      context.lineTo(right, rect.y)
      context.quadraticCurveTo(right, rect.y, right - 1, rect.y + radius)
      context.lineTo(right - 3, bottom - 7)
      let lobe = 0
      for (let x = right - 3; x > rect.x + 3; x -= 24) {
        const end = Math.max(rect.x + 3, x - 24)
        const edge = bottom - 6 + (lobe % 2) * 4
        context.quadraticCurveTo(x - (x - end) / 2, bottom + (lobe % 3 === 0 ? 5 : 2), end, edge)
        lobe += 1
      }
      context.lineTo(rect.x + 1, rect.y + radius)
      context.quadraticCurveTo(rect.x, rect.y, rect.x, rect.y)
      context.closePath()
    } else {
      context.roundRect(rect.x, rect.y, rect.w, rect.h, radius)
    }
    context.fill()
    context.stroke()

    context.fillStyle = moss
    context.beginPath()
    context.moveTo(rect.x + radius, rect.y)
    context.quadraticCurveTo(rect.x, rect.y, rect.x, rect.y + radius)
    context.lineTo(rect.x, rect.y + cap - 4)
    let scallop = 0
    for (let x = rect.x; x < right; x += 18) {
      const end = Math.min(x + 18, right)
      const edge = rect.y + cap - 4 + (scallop % 2) * 2
      const dip = rect.y + cap + ((scallop + Math.floor(rect.x / 16)) % 3 === 0 ? 2 : 0)
      context.quadraticCurveTo(x + (end - x) / 2, dip, end, edge)
      scallop += 1
    }
    context.lineTo(right, rect.y + radius)
    context.quadraticCurveTo(right, rect.y, right - radius, rect.y)
    context.closePath()
    context.fill()
    context.strokeStyle = line
    context.lineWidth = 2
    context.stroke()

    context.strokeStyle = 'rgb(255 255 224 / .38)'
    context.lineWidth = 2
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(rect.x + radius + 2, rect.y + 3)
    context.lineTo(right - radius - 2, rect.y + 3)
    context.stroke()

    if (natural && rect.w > 48) {
      context.strokeStyle = moss
      context.lineWidth = 3
      context.beginPath()
      for (let x = rect.x + 30; x < right - 16; x += 58) {
        context.moveTo(x, rect.y + 2)
        context.quadraticCurveTo(x + 4, rect.y - 5, x + 7, rect.y + 2)
        context.moveTo(x + 5, rect.y + 2)
        context.quadraticCurveTo(x + 10, rect.y - 3, x + 12, rect.y + 2)
      }
      context.stroke()

      context.strokeStyle = 'rgb(20 26 23 / .28)'
      context.lineWidth = 2
      context.beginPath()
      for (let x = rect.x + 46; x < right - 18; x += 74) {
        context.moveTo(x, rect.y + cap - 5)
        context.quadraticCurveTo(x + 7, rect.y + cap + 7, x - 2, rect.y + cap + 17)
      }
      context.stroke()
    }
    if (rect.kind === 'belt') {
      context.fillStyle = '#E9F4D6'
      for (let x = rect.x + 18; x < rect.x + rect.w - 8; x += 34) {
        context.beginPath()
        context.moveTo(x, rect.y + 3)
        context.lineTo(x + 8, rect.y + 6)
        context.lineTo(x, rect.y + 9)
        context.fill()
      }
    }
    if (rect.kind === 'lift') {
      context.strokeStyle = '#745331'
      context.lineWidth = 3
      context.beginPath()
      context.moveTo(rect.x + 8, rect.y)
      context.lineTo(rect.x + 8, rect.y - 42)
      context.moveTo(rect.x + rect.w - 8, rect.y)
      context.lineTo(rect.x + rect.w - 8, rect.y - 42)
      context.stroke()
    }
    if (rect.h > cap + 8) {
      const stones = []
      for (let y = rect.y + cap + 9, row = 0; y < rect.y + rect.h - 8; y += 27, row += 1) {
        const offset = row % 2 ? 24 : 0
        for (let x = rect.x + 11 + offset, column = 0; x < right - 11; column += 1) {
          const width = 30 + ((row + column + Math.floor(rect.x / 16)) % 3) * 6
          const height = 12 + ((row + column) % 2) * 3
          stones.push([x, y, Math.min(width, right - x - 9), height])
          x += width + 20
        }
      }
      context.strokeStyle = 'rgb(20 26 23 / .25)'
      context.lineWidth = 2
      context.beginPath()
      for (const [x, y, width, height] of stones) {
        context.moveTo(x, y + height * .58)
        context.quadraticCurveTo(x + 3, y, x + width * .45, y)
        context.quadraticCurveTo(x + width - 2, y, x + width, y + height * .55)
        context.quadraticCurveTo(x + width - 4, y + height, x + width * .4, y + height)
        context.quadraticCurveTo(x, y + height, x, y + height * .58)
      }
      context.stroke()
      context.strokeStyle = 'rgb(255 239 196 / .2)'
      context.lineWidth = 2
      context.beginPath()
      for (const [x, y, width] of stones) {
        context.moveTo(x + 7, y + 3)
        context.quadraticCurveTo(x + width * .32, y, x + width * .55, y + 2)
      }
      context.stroke()
    }
    context.restore()
  }

  function drawSeed(seed) {
    if (seed.found) return
    const bob = Math.sin(frame * 0.08 + seed.x) * 3
    context.save()
    context.translate(seed.x, seed.y + bob)
    context.shadowColor = '#FFE377'
    context.shadowBlur = 12
    context.fillStyle = '#FFF3A2'
    context.beginPath()
    context.moveTo(0, -13)
    context.quadraticCurveTo(12, -4, 0, 15)
    context.quadraticCurveTo(-12, -4, 0, -13)
    context.fill()
    context.shadowBlur = 0
    context.fillStyle = '#9B6B28'
    context.fillRect(-2, -18, 4, 6)
    context.restore()
  }

  function drawCell(sheet, cell, x, y, width, height, flip = 1) {
    if (!sheet.complete || !sheet.naturalWidth) return false
    const sourceWidth = sheet.naturalWidth / 4
    const sourceHeight = sheet.naturalHeight / 2
    context.save()
    context.translate(x + width / 2, y + height)
    context.scale(flip, 1)
    context.drawImage(
      sheet,
      (cell % 4) * sourceWidth,
      Math.floor(cell / 4) * sourceHeight,
      sourceWidth,
      sourceHeight,
      -width / 2,
      -height,
      width,
      height,
    )
    context.restore()
    return true
  }

  const drawWorldCell = (cell, x, y, width, height, flip = 1) =>
    drawCell(worldSheet, cell, x, y, width, height, flip)

  function drawEnemies() {
    for (const enemy of world.enemies) {
      if (!enemy.alive && enemy.squash <= 0) continue
      const walkFrame = Math.floor(frame / 12) % 2
      const sheet = enemy.kind === 'mossling'
        ? worldSheet
        : ['drizzlet', 'gearling'].includes(enemy.kind) ? regionSheet : finalSheet
      const frameIndex = enemy.kind === 'mossling'
        ? enemy.squash > 0 ? 3 : walkFrame
        : enemy.kind === 'drizzlet' || enemy.kind === 'mothlight'
          ? walkFrame
          : enemy.kind === 'gearling' || enemy.kind === 'sentry' ? 2 + walkFrame : 7
      const spriteWidth = enemy.kind === 'warden' ? 78 : 48
      const spriteHeight = enemy.kind === 'warden' ? 68 : 44
      const spriteX = enemy.x + enemy.w / 2 - spriteWidth / 2
      const spriteY = enemy.y + enemy.h - spriteHeight
      if (enemy.invulnerable > 0 && frame % 4 < 2) context.globalAlpha = .48
      if (!drawCell(sheet, frameIndex, spriteX, spriteY, spriteWidth, spriteHeight, enemy.vx < 0 ? -1 : 1)) {
        context.fillStyle = '#7FA84E'
        context.beginPath()
        context.roundRect(enemy.x, enemy.y, enemy.w, enemy.h, 10)
        context.fill()
      }
      context.globalAlpha = 1
      if (enemy.kind === 'warden' && enemy.alive) {
        for (let index = 0; index < enemy.maxHealth; index += 1) {
          context.fillStyle = index < enemy.health ? '#FFE377' : '#394944'
          context.beginPath()
          context.arc(enemy.x + enemy.w / 2 + (index - 1) * 15, enemy.y - 11, 5, 0, Math.PI * 2)
          context.fill()
        }
      }
    }
  }

  function drawCloaks() {
    for (const cloak of world.cloak) {
      if (cloak.found) continue
      const bob = Math.sin(frame * .06) * 3
      drawWorldCell(4, cloak.x - 26, cloak.y - 42 + bob, 52, 64)
    }
  }

  function drawSprings() {
    for (const spring of world.springs) {
      context.save()
      context.translate(spring.x, spring.y)
      context.fillStyle = '#305E3D'
      context.fillRect(-13, -6, 26, 6)
      context.fillStyle = '#BDE879'
      context.beginPath()
      context.ellipse(0, -8, 19, 8, 0, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = '#305E3D'
      context.lineWidth = 3
      context.stroke()
      context.restore()
    }
  }

  function drawFansAndSwitches() {
    for (const fan of world.fans) drawCell(regionSheet, 4, fan.x - 24, fan.y - 48, 48, 50)
    for (const item of world.switches) {
      context.save()
      if (item.active) {
        context.shadowColor = '#FFE377'
        context.shadowBlur = 15
      }
      drawCell(regionSheet, 7, item.x - 20, item.y - 43, 40, 45)
      context.restore()
    }
  }

  function drawLampsAndGates() {
    for (const lamp of world.lamps) {
      drawCell(finalSheet, lamp.lit ? 5 : 4, lamp.x - 24, lamp.y - 62, 48, 64)
    }
    for (const gate of world.gates) {
      if (!gate.active) continue
      drawCell(finalSheet, 6, gate.x - 12, gate.y + gate.h - 112, 72, 112)
    }
  }

  function drawCheckpoint() {
    const checkpoint = world.checkpoint
    if (!checkpoint) return
    const px = checkpoint.x
    const py = checkpoint.y
    context.fillStyle = '#5A4534'
    context.fillRect(px - 2, py - 48, 4, 48)
    context.save()
    if (checkpoint.active) {
      context.shadowColor = '#B8F4BD'
      context.shadowBlur = 16
    }
    context.fillStyle = checkpoint.active ? '#C9F5C9' : '#FFE8A2'
    context.fillRect(px - 10, py - 45, 20, 20)
    context.restore()
    context.strokeStyle = '#5A4534'
    context.lineWidth = 3
    context.strokeRect(px - 10, py - 45, 20, 20)
  }

  function drawHiddenLights() {
    for (const light of world.hiddenLights || []) {
      const glow = light.found ? 18 : 11
      context.save()
      context.translate(light.x, light.y)
      context.shadowColor = '#FFE377'
      context.shadowBlur = glow
      context.fillStyle = light.found ? '#FFF4B0' : '#FFE377'
      context.beginPath()
      context.roundRect(-10, -42, 20, 25, 7)
      context.fill()
      context.shadowBlur = 0
      context.strokeStyle = '#5A4534'
      context.lineWidth = 3
      context.stroke()
      context.beginPath()
      context.arc(0, -42, 7, Math.PI, 0)
      context.stroke()
      context.fillStyle = '#5A4534'
      context.fillRect(-2, -17, 4, 8)
      if (!light.found) {
        context.fillStyle = '#FFF4B0'
        context.fillRect(-23, -43, 5, 3)
        context.fillRect(18, -33, 5, 3)
      }
      context.restore()
    }
  }

  function drawBell() {
    const { x, y } = world.finish
    const floor = y + TILE
    const guardian = guardianState(world)
    const locked = guardian.guardianMax > 0 && !guardian.guardianDefeated
    context.strokeStyle = '#49382D'
    context.lineWidth = 5
    context.beginPath()
    context.moveTo(x + 4, floor)
    context.lineTo(x + 4, floor - 70)
    context.lineTo(x + 34, floor - 70)
    context.stroke()
    context.fillStyle = locked ? '#77847E' : '#F7C94C'
    context.beginPath()
    context.arc(x + 34, floor - 53, 15, Math.PI, 0)
    context.lineTo(x + 49, floor - 38)
    context.lineTo(x + 19, floor - 38)
    context.closePath()
    context.fill()
    context.fillStyle = '#49382D'
    context.beginPath()
    context.arc(x + 34, floor - 35, 5, 0, Math.PI * 2)
    context.fill()
    if (locked) {
      context.strokeStyle = '#FFF1BB'
      context.lineWidth = 4
      context.strokeRect(x + 24, floor - 63, 20, 20)
      context.beginPath()
      context.arc(x + 34, floor - 63, 8, Math.PI, 0)
      context.stroke()
    }
  }

  function drawPlayer(subject = player, deathProgress = 0) {
    const pose = PLAYER_FRAMES[subject.pose] ?? 0
    const animationFrame = subject.pose === 'run' ? (Math.floor(frame / 7) % 3) + 1 : pose
    const sourceWidth = courier.naturalWidth / 4
    const sourceHeight = courier.naturalHeight / 2
    const sourceX = (animationFrame % 4) * sourceWidth
    const sourceY = Math.floor(animationFrame / 4) * sourceHeight
    const width = 62
    const height = 82
    const x = subject.x + subject.w / 2
    const y = subject.y + subject.h

    context.save()
    context.translate(x, y)
    context.scale(subject.facing, 1)
    if (deathProgress) {
      context.globalAlpha = 1 - deathProgress * .78
      if (!reducedMotion) {
        context.translate(0, -Math.sin(deathProgress * Math.PI) * 12)
        context.rotate(deathProgress * .2)
      }
    }
    drawPowerAura(context, subject, frame, width, height)
    if (courier.complete && courier.naturalWidth) {
      context.drawImage(courier, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height + 9, width, height)
    } else {
      context.fillStyle = '#365A40'
      context.fillRect(-12, -38, 24, 38)
      context.fillStyle = '#E6B98A'
      context.beginPath()
      context.arc(0, -43, 10, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  function drawParticles() {
    for (const particle of particles) {
      context.globalAlpha = clamp(particle.life / 24, 0, 1)
      context.fillStyle = particle.color
      context.fillRect(particle.x - 3, particle.y - 3, 6, 6)
    }
    context.globalAlpha = 1
  }

  function drawImpact() {
    if (!impact) return
    const progress = 1 - impact.life / impact.maxLife
    const radius = impact.expands ? 12 + progress * 30 : 24
    context.save()
    context.globalAlpha = impact.expands ? 1 - progress : .9
    context.strokeStyle = impact.color
    context.lineWidth = 4
    context.beginPath()
    context.arc(impact.x, impact.y, radius, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  function drawHint(width, height) {
    const hint = playHint({
      finished,
      moved,
      jumped,
      glowing: player.glowing,
      sparkFrames: player.sparkFrames,
      x: player.x,
      y: player.y,
      finishX: world.finish.x,
      finishY: world.finish.y,
      frame,
    })
    if (!hint.text) return
    const bubbleWidth = hint.kind === 'guide' ? 94 : Math.min(250, width - 32)
    const bubbleX = hint.kind === 'guide' ? width - bubbleWidth - 16 : (width - bubbleWidth) / 2
    // The top band sits under the status pill and clear of the ground line a kid watches.
    const bubbleY = Math.min(HINT_TOP, height / 2 - 48)
    context.setTransform(1, 0, 0, 1, 0, 0)
    const ratio = Math.min(devicePixelRatio || 1, 2)
    context.scale(ratio, ratio)
    context.fillStyle = 'rgb(255 253 242 / .94)'
    context.strokeStyle = '#173D3A'
    context.lineWidth = 3
    context.beginPath()
    context.roundRect(bubbleX, bubbleY, bubbleWidth, 48, 16)
    context.fill()
    context.stroke()
    context.fillStyle = '#173D3A'
    context.font = '900 16px ui-rounded, system-ui, sans-serif'
    context.textAlign = 'center'
    context.fillText(hint.text, bubbleX + bubbleWidth / 2, bubbleY + 31)
  }

  function drawRespawn(width, height) {
    if (!respawn) return
    const progress = 1 - respawn.life / RESPAWN_FRAMES
    const curtain = 1 - Math.abs(progress * 2 - 1)
    const ratio = Math.min(devicePixelRatio || 1, 2)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = `rgb(23 61 58 / ${.12 + curtain * .72})`
    context.fillRect(0, 0, width, height)
    context.globalAlpha = clamp(Math.min(progress, 1 - progress) * 6, 0, 1)
    context.strokeStyle = '#173D3A'
    context.lineWidth = 6
    context.fillStyle = '#FFFDF2'
    context.font = '900 28px ui-rounded, system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.strokeText('WHOOPS!', width / 2, height / 2)
    context.fillText('WHOOPS!', width / 2, height / 2)
    context.globalAlpha = 1
  }

  function paint() {
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(devicePixelRatio || 1, 2)
    const width = bounds.width
    const height = bounds.height
    if (!width || !height) return
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
    const scale = cameraScale(width, height)
    const viewWidth = width / scale
    const viewHeight = height / scale
    const maxCamera = Math.max(0, world.width - viewWidth)
    const maxCameraY = Math.max(0, WORLD_HEIGHT - viewHeight)
    const displayPlayer = respawn?.player || player
    const target = cameraTarget({
      playerX: displayPlayer.x,
      direction: cameraDirection,
      viewWidth,
      worldWidth: world.width,
      reducedMotion,
    })
    const targetY = verticalCameraTarget({
      playerY: displayPlayer.y,
      playerHeight: displayPlayer.h,
      viewHeight,
    })
    cameraViewWidth = viewWidth
    cameraViewHeight = viewHeight
    if (respawn?.player && cameraReady) {
      // The respawn veil covers the camera cut.
    } else if (reducedMotion || !cameraReady) {
      camera = target
      cameraY = targetY
      cameraReady = true
    } else {
      camera += (target - camera) * .12
      cameraY += (targetY - cameraY) * .12
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    drawBackground(width, height, viewWidth)

    context.save()
    context.scale(scale, scale)
    const cameraJolt = reducedMotion || !cameraKick ? 0 : (frame % 2 ? cameraKick : -cameraKick)
    const cameraLeft = clamp(camera + cameraJolt, 0, maxCamera)
    const cameraTop = clamp(cameraY, 0, maxCameraY)
    context.translate(-cameraLeft, -cameraTop)
    for (const rect of world.terrain) {
      if (!terrainVisible(rect, cameraLeft, cameraTop, viewWidth, viewHeight)) continue
      drawTerrain(rect)
    }
    for (const seed of world.seeds) drawSeed(seed)
    drawCloaks()
    drawSprings()
    drawFansAndSwitches()
    drawLampsAndGates()
    drawHiddenLights()
    drawCheckpoint()
    drawBell()
    drawEnemies()
    drawParticles()
    drawImpact()
    const deathProgress = respawn?.player ? (RESPAWN_FRAMES - respawn.life) / (RESPAWN_FRAMES / 2) : 0
    drawPlayer(displayPlayer, deathProgress)
    context.restore()
    if (!respawn) drawHint(width, height)
    drawRespawn(width, height)
  }

  function loop(time) {
    if (!running) return
    if (!lastTime) lastTime = time
    accumulator += Math.min(100, time - lastTime)
    lastTime = time
    while (accumulator >= FIXED_STEP) {
      update()
      accumulator -= FIXED_STEP
    }
    paint()
    raf = requestAnimationFrame(loop)
  }

  function setInput(action, pressed, source = 'direct') {
    const sources = inputSources[action]
    if (!sources) return
    if (respawn && pressed) return
    const wasPressed = sources.size > 0
    if (pressed) sources.add(source)
    else sources.delete(source)
    const isPressed = sources.size > 0
    if (wasPressed !== isPressed) setInputState(input, action, isPressed)
  }

  function clearInput() {
    for (const sources of Object.values(inputSources)) sources.clear()
    clearInputState(input, player)
  }

  function onKey(event) {
    const action = event.code === 'ArrowLeft' || event.code === 'KeyA'
      ? 'left'
      : event.code === 'ArrowRight' || event.code === 'KeyD'
        ? 'right'
        : event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW'
          ? 'jump'
          : null
    if (!action) return
    const source = `key:${event.code}`
    if (interactiveKeyTarget(event.target, event.code)) {
      if (event.type === 'keyup') setInput(action, false, source)
      return
    }
    const mode = keyInputMode({ type: event.type, running, paused, finished, respawning: Boolean(respawn) })
    if (mode === 'ignore') return
    if (mode === 'release') return setInput(action, false, source)
    event.preventDefault()
    setInput(action, event.type === 'keydown', source)
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  for (const { image } of Object.values(art)) image.addEventListener('load', paint)

  return {
    start(levelId = 'garden-1', options = {}) {
      const level = LEVELS.find(item => item.id === levelId) || LEVELS[0]
      if (Array.isArray(options?.foundHiddenLights)) knownHiddenLights = [...new Set(options.foundHiddenLights)]
      loadArt(level)
      simulation = createSimulation(level)
      for (const light of simulation.world.hiddenLights || []) {
        light.found = knownHiddenLights.includes(light.id)
      }
      syncSimulation()
      clearInput()
      resetFeedback()
      camera = 0
      cameraY = 0
      cameraReady = false
      cameraDirection = 0
      paused = false
      lastTime = 0
      accumulator = 0
      running = true
      report('')
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    },
    restart() {
      this.start(world.level.id, { foundHiddenLights: knownHiddenLights })
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
      clearInput()
      resetFeedback()
    },
    resize: paint,
    setInput,
    togglePause() {
      if (!running || finished) return paused
      paused = !paused
      if (paused) clearInput()
      onCue('pause')
      report(paused ? 'PAUSED' : 'GO!')
      return paused
    },
    pause() {
      if (!running || finished || paused) return paused
      paused = true
      clearInput()
      onCue('pause')
      report('PAUSED')
      return paused
    },
    clearInput,
  }
}
