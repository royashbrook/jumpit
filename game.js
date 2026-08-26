import { createBody, isStomp, stepPhysics } from './engine/physics.js'
import { LEVELS, REGIONS, TILE } from './levels.js'

const WORLD_HEIGHT = 18 * TILE
const FIXED_STEP = 1000 / 60
const PLAYER_FRAMES = { idle: 0, run: 1, jump: 4, fall: 5 }
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

function loadImage(source) {
  const image = new Image()
  image.src = source
  image.decode?.().catch(() => {})
  return image
}

function overlaps(body, x, y, width, height) {
  return body.x < x + width && body.x + body.w > x && body.y < y + height && body.y + body.h > y
}

export function makeWorld(level) {
  const checkpoint = level.objects.find(([, kind]) => kind === 'checkpoint')
  return {
    level,
    width: level.size[0] * TILE,
    terrain: level.terrain.map(([, kind, x, y, width, height]) => ({
      kind,
      type: height === 1 ? 'oneway' : 'solid',
      x: x * TILE,
      y: y * TILE,
      w: width * TILE,
      h: height * TILE,
      active: true,
      timer: 0,
    })),
    seeds: level.objects
      .filter(([, kind]) => kind === 'seed')
      .map(([id,, x, y]) => ({ id, x: (x + 0.5) * TILE, y: (y + 0.45) * TILE, found: false })),
    enemies: level.objects
      .filter(([, kind]) => kind === 'mossling')
      .map(([id, kind, x, y]) => ({
        id,
        kind,
        x: (x + 0.5) * TILE - 18,
        y: (y + 1) * TILE - 28,
        w: 36,
        h: 28,
        home: (x + 0.5) * TILE - 18,
        vx: -0.55,
        alive: true,
        squash: 0,
      })),
    cloak: level.objects
      .filter(([, kind]) => kind === 'cloak')
      .map(([id,, x, y]) => ({ id, x: (x + 0.5) * TILE, y: (y + 0.4) * TILE, found: false })),
    springs: level.objects
      .filter(([, kind]) => kind === 'spring')
      .map(([id,, x, y]) => ({ id, x: (x + 0.5) * TILE, y: (y + 1) * TILE })),
    checkpoint: checkpoint ? {
      id: checkpoint[0],
      x: (checkpoint[2] + 0.5) * TILE,
      y: (checkpoint[3] + 1) * TILE,
      active: false,
    } : null,
    finish: { id: level.finish[0], x: level.finish[1] * TILE, y: level.finish[2] * TILE },
  }
}

export function activateCheckpoint(world, player) {
  const checkpoint = world.checkpoint
  if (!checkpoint || checkpoint.active || !overlaps(player, checkpoint.x - 14, checkpoint.y - 52, 28, 52)) return false
  checkpoint.active = true
  player.spawnX = checkpoint.x - player.w / 2
  player.spawnY = checkpoint.y - player.h
  return true
}

export function createGame(canvas, onState = () => {}, onCue = () => {}) {
  const context = canvas.getContext('2d')
  const background = loadImage('assets/backgrounds/garden-walk.png')
  const courier = loadImage('assets/sprites/courier-sheet.png')
  const worldSheet = loadImage('assets/sprites/world-sheet.png')
  const input = { left: false, right: false, jumpHeld: false, jumpPressed: false }
  const particles = []
  let world = makeWorld(LEVELS[0])
  let player = createPlayer(world.level)
  let camera = 0
  let running = false
  let paused = false
  let finished = false
  let moved = false
  let frame = 0
  let lastTime = 0
  let accumulator = 0
  let raf = 0

  function createPlayer(level) {
    const [spawnX, spawnY] = level.spawn
    const body = createBody({ x: spawnX * TILE + 2, y: (spawnY + 1) * TILE - 42 })
    body.spawnX = body.x
    body.spawnY = body.y
    body.glowing = false
    return body
  }

  function report(message = '') {
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
      message,
    })
  }

  function burst(x, y, color = '#FFD563') {
    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10
      particles.push({ x, y, vx: Math.cos(angle) * (1.5 + index % 3), vy: Math.sin(angle) * 2.2 - 1, life: 34, color })
    }
  }

  function resetPlayer() {
    player.x = player.spawnX
    player.y = player.spawnY
    player.vx = 0
    player.vy = 0
    camera = clamp(player.x - 72, 0, Math.max(0, world.width - 320))
  }

  function update() {
    if (paused || finished) return
    stepPhysics(player, input, world.terrain.filter(rect => rect.active))
    if (player.justJumped) onCue('jump')
    input.jumpPressed = false
    if (Math.abs(player.vx) > 0.25 || !player.onGround) moved = true

    for (const seed of world.seeds) {
      if (!seed.found && overlaps(player, seed.x - 12, seed.y - 15, 24, 30)) {
        seed.found = true
        burst(seed.x, seed.y)
        onCue('seed')
        report('LANTERN SEED!')
      }
    }

    for (const cloak of world.cloak) {
      if (!cloak.found && overlaps(player, cloak.x - 18, cloak.y - 25, 36, 50)) {
        cloak.found = true
        player.glowing = true
        burst(cloak.x, cloak.y, '#B8F4BD')
        onCue('power')
        report('GLOW CLOAK · BUMP CREATURES!')
      }
    }

    for (const enemy of world.enemies) {
      if (enemy.squash > 0) {
        enemy.squash -= 1
        continue
      }
      if (!enemy.alive) continue
      enemy.x += enemy.vx
      if (enemy.x < enemy.home - 52 || enemy.x > enemy.home + 52) enemy.vx *= -1
      if (!overlaps(player, enemy.x, enemy.y, enemy.w, enemy.h)) continue
      if (player.glowing || isStomp(player, enemy)) {
        enemy.alive = false
        enemy.squash = 28
        player.vy = -7.8
        burst(enemy.x + enemy.w / 2, enemy.y + 8, '#A8D969')
        onCue('stomp')
        report(player.glowing ? 'GLOW BUMP!' : 'BOUNCE!')
      } else {
        resetPlayer()
        onCue('hurt')
        report('OOPS · TRY AGAIN!')
      }
    }

    for (const spring of world.springs) {
      if (player.vy >= 0 && overlaps(player, spring.x - 18, spring.y - 14, 36, 16)) {
        player.vy = -13.2
        player.onGround = false
        burst(spring.x, spring.y - 8, '#C9F58C')
        onCue('power')
        report('LEAF SPRING!')
      }
    }

    for (const rect of world.terrain.filter(item => item.kind === 'crumble')) {
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
        burst(player.x + player.w / 2, rect.y, '#C79458')
      }
    }

    if (activateCheckpoint(world, player)) {
      burst(world.checkpoint.x, world.checkpoint.y - 30, '#A9F0B2')
      onCue('checkpoint')
      report('LANTERN LIT · CHECKPOINT!')
    }

    const bell = world.finish
    if (overlaps(player, bell.x - 6, bell.y - 48, 44, 72)) {
      finished = true
      burst(bell.x + 16, bell.y - 28, '#FFF4B0')
      onCue('finish')
      report('TRAIL CLEARED!')
    }

    if (player.y > WORLD_HEIGHT + 96) {
      resetPlayer()
      onCue('hurt')
      report(world.checkpoint?.active ? 'BACK TO THE LANTERN' : 'TRY THAT JUMP AGAIN')
    }

    for (const particle of particles) {
      particle.x += particle.vx
      particle.y += particle.vy
      particle.vy += 0.12
      particle.life -= 1
    }
    while (particles[0]?.life <= 0) particles.shift()
  }

  function drawBackground(width, height) {
    if (background.complete && background.naturalWidth) {
      const sourceHeight = background.naturalHeight
      const sourceWidth = Math.min(background.naturalWidth, sourceHeight * width / height)
      const progress = camera / Math.max(1, world.width - width)
      const sourceX = (background.naturalWidth - sourceWidth) * clamp(progress, 0, 1)
      context.drawImage(background, sourceX, 0, sourceWidth, sourceHeight, 0, 0, width, height)
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
    return ['#72513A', '#8BC65A', '#3F372C']
  }

  function drawTerrain(rect) {
    if (!rect.active) return
    const [soil, moss, line] = terrainPalette(rect.kind)
    const shake = rect.kind === 'crumble' && rect.timer > 24 ? Math.sin(frame * 1.8) * 2 : 0
    context.save()
    context.translate(shake, 0)
    context.fillStyle = soil
    context.fillRect(rect.x, rect.y, rect.w, rect.h)
    context.fillStyle = moss
    context.fillRect(rect.x, rect.y, rect.w, Math.min(9, rect.h))
    context.fillStyle = line
    context.fillRect(rect.x, rect.y + Math.min(9, rect.h), rect.w, 3)
    context.fillStyle = 'rgb(255 255 255 / .16)'
    for (let x = rect.x + 12; x < rect.x + rect.w; x += 28) context.fillRect(x, rect.y + 2, 9, 2)
    if (rect.h > 16) {
      for (let y = rect.y + 22; y < rect.y + rect.h; y += 22) {
        const offset = (Math.floor(y / 22) % 2) * 13
        for (let x = rect.x + 9 + offset; x < rect.x + rect.w - 5; x += 29) {
          context.fillStyle = (x + y) % 3 ? '#5C4437' : '#89644A'
          context.fillRect(x, y, 9, 5)
          context.fillStyle = 'rgb(255 255 255 / .08)'
          context.fillRect(x + 1, y, 6, 1)
        }
      }
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

  function drawWorldCell(cell, x, y, width, height, flip = 1) {
    if (!worldSheet.complete || !worldSheet.naturalWidth) return false
    const sourceWidth = worldSheet.naturalWidth / 4
    const sourceHeight = worldSheet.naturalHeight / 2
    context.save()
    context.translate(x + width / 2, y + height)
    context.scale(flip, 1)
    context.drawImage(
      worldSheet,
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

  function drawEnemies() {
    for (const enemy of world.enemies) {
      if (!enemy.alive && enemy.squash <= 0) continue
      const frameIndex = enemy.squash > 0 ? 3 : Math.floor(frame / 12) % 3
      if (!drawWorldCell(frameIndex, enemy.x - 6, enemy.y - 12, 48, 44, enemy.vx < 0 ? -1 : 1)) {
        context.fillStyle = '#7FA84E'
        context.beginPath()
        context.roundRect(enemy.x, enemy.y, enemy.w, enemy.h, 10)
        context.fill()
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

  function drawBell() {
    const { x, y } = world.finish
    const floor = (y + 1) * TILE
    context.strokeStyle = '#49382D'
    context.lineWidth = 5
    context.beginPath()
    context.moveTo(x + 4, floor)
    context.lineTo(x + 4, floor - 70)
    context.lineTo(x + 34, floor - 70)
    context.stroke()
    context.fillStyle = '#F7C94C'
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
  }

  function drawPlayer() {
    const pose = PLAYER_FRAMES[player.pose] ?? 0
    const animationFrame = player.pose === 'run' ? (Math.floor(frame / 7) % 3) + 1 : pose
    const sourceWidth = courier.naturalWidth / 4
    const sourceHeight = courier.naturalHeight / 2
    const sourceX = (animationFrame % 4) * sourceWidth
    const sourceY = Math.floor(animationFrame / 4) * sourceHeight
    const width = 62
    const height = 82
    const x = player.x + player.w / 2
    const y = player.y + player.h

    context.save()
    context.translate(x, y)
    context.scale(player.facing, 1)
    if (player.glowing) {
      context.shadowColor = '#D4FF9D'
      context.shadowBlur = 18
      context.fillStyle = 'rgb(213 255 165 / .28)'
      context.beginPath()
      context.ellipse(0, -height * .45, width * .38, height * .48, 0, 0, Math.PI * 2)
      context.fill()
    }
    if (courier.complete && courier.naturalWidth) {
      context.drawImage(courier, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height, width, height)
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

  function drawHint(width, height) {
    if (moved || finished) return
    const bubbleWidth = Math.min(250, width - 32)
    context.setTransform(1, 0, 0, 1, 0, 0)
    const ratio = Math.min(devicePixelRatio || 1, 2)
    context.scale(ratio, ratio)
    context.fillStyle = 'rgb(255 253 242 / .94)'
    context.strokeStyle = '#173D3A'
    context.lineWidth = 3
    context.beginPath()
    context.roundRect((width - bubbleWidth) / 2, height - 96, bubbleWidth, 48, 16)
    context.fill()
    context.stroke()
    context.fillStyle = '#173D3A'
    context.font = '900 16px ui-rounded, system-ui, sans-serif'
    context.textAlign = 'center'
    context.fillText('RUN RIGHT · TAP JUMP', width / 2, height - 65)
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
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    drawBackground(width, height)

    const scale = height / WORLD_HEIGHT
    const viewWidth = width / scale
    const maxCamera = Math.max(0, world.width - viewWidth)
    const target = clamp(player.x - viewWidth * 0.34, 0, maxCamera)
    camera += (target - camera) * 0.12

    context.save()
    context.scale(scale, scale)
    context.translate(-camera, 0)
    for (const rect of world.terrain) drawTerrain(rect)
    for (const seed of world.seeds) drawSeed(seed)
    drawCloaks()
    drawSprings()
    drawCheckpoint()
    drawBell()
    drawEnemies()
    drawParticles()
    drawPlayer()
    context.restore()
    drawHint(width, height)
  }

  function loop(time) {
    if (!running) return
    if (!lastTime) lastTime = time
    accumulator += Math.min(100, time - lastTime)
    lastTime = time
    while (accumulator >= FIXED_STEP) {
      update()
      accumulator -= FIXED_STEP
      frame += 1
    }
    paint()
    raf = requestAnimationFrame(loop)
  }

  function setInput(action, pressed) {
    if (action === 'jump') {
      if (pressed && !input.jumpHeld) input.jumpPressed = true
      input.jumpHeld = pressed
    } else if (action in input) input[action] = pressed
  }

  function onKey(event) {
    const action = event.code === 'ArrowLeft' || event.code === 'KeyA'
      ? 'left'
      : event.code === 'ArrowRight' || event.code === 'KeyD'
        ? 'right'
        : event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW'
          ? 'jump'
          : null
    if (!action || !running) return
    event.preventDefault()
    setInput(action, event.type === 'keydown')
  }

  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  background.addEventListener('load', paint)
  courier.addEventListener('load', paint)
  worldSheet.addEventListener('load', paint)

  return {
    start(levelId = 'garden-1') {
      const level = LEVELS.find(item => item.id === levelId) || LEVELS[0]
      world = makeWorld(level)
      player = createPlayer(level)
      camera = 0
      paused = false
      finished = false
      moved = false
      lastTime = 0
      accumulator = 0
      running = true
      report('RUN RIGHT · TAP JUMP')
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    },
    restart() {
      this.start(world.level.id)
    },
    stop() {
      running = false
      cancelAnimationFrame(raf)
      for (const action of ['left', 'right', 'jump']) setInput(action, false)
    },
    resize: paint,
    setInput,
    togglePause() {
      if (!running || finished) return paused
      paused = !paused
      onCue('pause')
      report(paused ? 'PAUSED' : 'GO!')
      return paused
    },
  }
}
