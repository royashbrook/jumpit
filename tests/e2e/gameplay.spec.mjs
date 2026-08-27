import { expect, test } from 'playwright/test'

const pointer = (page, selector, type, pointerId = 7, isPrimary = true) => page.dispatchEvent(selector, type, {
  pointerId, pointerType: 'touch', isPrimary, buttons: type === 'pointerdown' ? 1 : 0,
})

async function launchTrail(page) {
  const play = page.getByRole('button', { name: 'PLAY THE TRAIL' })
  await expect(play).toBeVisible()
  await expect(play).toBeEnabled()
  await play.dispatchEvent('click')
}

const completedBeforeKeep = [
  'garden-1', 'garden-2', 'garden-3', 'garden-4',
  'rooftop-1', 'rooftop-2', 'rooftop-3', 'rooftop-4',
  'workshop-1', 'workshop-2', 'workshop-3', 'workshop-4',
  'market-1', 'market-2', 'market-3', 'market-4',
  'keep-1', 'keep-2', 'keep-3',
]

const allHiddenLights = [
  'g03-hidden-light', 'r03-hidden-light', 'w02-hidden-light',
  'm03-hidden-light', 'k01-hidden-light',
]

const endingGameStub = `
export function createGame(_canvas, onState = () => {}, onCue = () => {}) {
  let levelId = 'garden-1'
  let health = 3
  let finished = false
  let paused = false
  const report = message => onState({
    levelId,
    levelName: levelId === 'keep-4' ? 'The Waking Beacon' : 'Dewdrop Dash',
    regionName: levelId === 'keep-4' ? 'Beacon Keep' : 'Garden Walk',
    seeds: levelId === 'keep-4' ? 5 : 0,
    maxSeeds: levelId === 'keep-4' ? 5 : 4,
    paused,
    finished,
    message,
    ...(levelId === 'keep-4' ? { guardianHealth: health, guardianMax: 3, guardianDefeated: health === 0 } : {}),
  })
  const start = id => {
    levelId = id
    health = 3
    finished = false
    paused = false
    report(levelId === 'keep-4' ? 'THE WARDEN GUARDS THE BELL' : '')
  }
  return {
    start,
    restart() { start(levelId) },
    stop() {},
    resize() {},
    clearInput() {},
    setInput(action, value) {
      if (!value || levelId !== 'keep-4' || finished) return
      if (action === 'jump' && health > 0) {
        health -= 1
        onCue(health ? 'guardian-hit' : 'guardian-defeated')
        report(health ? 'THE WARDEN SHAKES' : 'THE BELL IS FREE')
      } else if (action === 'right' && health === 0) {
        finished = true
        onCue('finish')
        report('THE BEACON IS AWAKE')
      }
    },
    togglePause() { paused = !paused; report(paused ? 'PAUSED' : 'GO!'); return paused },
    pause() { paused = true; report('PAUSED'); return paused },
  }
}
`

const inputGameStub = `
export function createGame(_canvas, onState = () => {}) {
  const log = (action, value) => {
    const events = JSON.parse(document.documentElement.dataset.inputEvents || '[]')
    events.push(action + ':' + value)
    document.documentElement.dataset.inputEvents = JSON.stringify(events)
  }
  const setInput = (action, value) => log(action, value)
  const onKey = event => {
    if (event.code !== 'Space') return
    setInput('jump', event.type === 'keydown')
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  const report = (paused = false) => onState({
    levelId: 'garden-1', levelName: 'Dewdrop Dash', regionName: 'Garden Walk',
    seeds: 0, maxSeeds: 3, paused, finished: false, message: '',
  })
  return {
    start() { report(false) }, restart() { report(false) }, stop() {}, resize() {}, setInput,
    clearInput() { setInput('left', false); setInput('right', false); setInput('jump', false) },
    togglePause() { report(true); return true }, pause() { report(true); return true },
  }
}
`

const shellFeedbackGameStub = `
export function createGame(_canvas, onState = () => {}) {
  let levelId = 'garden-1'
  let finished = false
  let paused = false
  const report = message => onState({
    levelId,
    levelName: levelId === 'garden-4' ? 'Bramble Bank' : 'Dewdrop Dash',
    regionName: 'Garden Walk',
    seeds: 1,
    maxSeeds: levelId === 'garden-4' ? 4 : 3,
    paused,
    finished,
    message,
  })
  const start = id => {
    levelId = id
    finished = false
    paused = false
    report('')
  }
  return {
    start,
    restart() { start(levelId) },
    stop() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (!value || action !== 'right' || finished) return
      if (levelId === 'garden-4') finished = true
      report(finished ? 'TRAIL CLEARED!' : 'LANTERN SEED!')
    },
    togglePause() { paused = !paused; report(paused ? 'PAUSED' : 'GO!'); return paused },
    pause() { paused = true; report('PAUSED'); return paused },
  }
}
`

const hiddenLightGameStub = `
export function createGame(_canvas, onState = () => {}, onCue = () => {}) {
  let levelId = 'garden-3'
  let found = false
  const report = message => onState({
    levelId, levelName: 'Sunleaf Rise', regionName: 'Garden Walk',
    seeds: 0, maxSeeds: 4, paused: false, finished: false, message,
    hiddenLightId: found ? 'g03-hidden-light' : null,
  })
  const start = (id, options = {}) => {
    levelId = id
    found = Boolean(options.foundHiddenLights?.includes('g03-hidden-light'))
    report('')
  }
  return {
    start, restart() { start(levelId) }, stop() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (!value || action !== 'jump' || found) return
      found = true
      onCue('hidden-light')
      report('HIDDEN LIGHT FOUND!')
    },
    togglePause() { return false }, pause() { return false },
  }
}
`

test('the first visible action pays off inside five seconds with a real seed', async ({ page }) => {
  await page.goto('/')
  const started = Date.now()
  await launchTrail(page)
  await expect(page.locator('#stage')).toBeVisible()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await pointer(page, '#move-right', 'pointerdown')
  await expect(page.locator('#seed-count')).toContainText('1/3', { timeout: 5_000 })
  await pointer(page, '#move-right', 'pointerup')
  expect(Date.now() - started).toBeLessThan(5_000)
  await expect(page.locator('#stage')).toBeVisible()
})

test('identical reward messages visibly retrigger their status animation', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: shellFeedbackGameStub }))
  await page.goto('/')
  await launchTrail(page)
  await page.locator('#game-status').evaluate(element => {
    document.documentElement.dataset.statusStarts = '0'
    element.addEventListener('animationstart', () => {
      const count = Number(document.documentElement.dataset.statusStarts || 0)
      document.documentElement.dataset.statusStarts = String(count + 1)
    })
  })

  await page.locator('#move-right').click()
  await expect.poll(() => page.locator('html').getAttribute('data-status-starts')).toBe('1')
  await expect(page.locator('#game-status')).toHaveText('LANTERN SEED!')
  await page.waitForTimeout(160)
  await page.locator('#move-right').click()
  await expect.poll(() => page.locator('html').getAttribute('data-status-starts')).toBe('2')
  await expect(page.locator('#game-status')).toHaveText('LANTERN SEED!')
})

test('a clear names place progress and the trail or place it just opened', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: shellFeedbackGameStub }))
  await page.addInitScript(() => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 2,
    completed: ['garden-1', 'garden-2', 'garden-3'],
    unlocked: ['garden-1', 'garden-2', 'garden-3', 'garden-4'],
    bestSeeds: {},
    selectedLevel: 'garden-4',
    theme: 'garden',
    muted: true,
    dailyWins: [],
  })))
  await page.goto('/')
  await launchTrail(page)
  await page.locator('#move-right').click()

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('#overlay-copy')).toHaveText('GARDEN WALK: 4 OF 4 TRAILS LIT. ROOFTOP RAIN IS NOW OPEN.')
  await expect(page.getByRole('button', { name: 'NEXT TRAIL' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'NEXT TRAIL' })).toBeFocused()
})

test('a hidden light stamps once, survives reload, and only then reveals Home progress', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: hiddenLightGameStub }))
  await page.addInitScript(() => {
    if (localStorage.getItem('jumpit-save-v1')) return
    localStorage.setItem('jumpit-save-v1', JSON.stringify({
      version: 3,
      completed: ['garden-1', 'garden-2'],
      unlocked: ['garden-1', 'garden-2', 'garden-3'],
      bestSeeds: {},
      selectedLevel: 'garden-3',
      theme: 'garden',
      muted: true,
      dailyWins: [],
      hiddenLights: [],
    }))
  })
  await page.goto('/')
  await expect(page.locator('#hidden-lights')).toBeHidden()
  await launchTrail(page)
  await page.locator('#jump').click()
  await page.locator('#jump').click()
  await expect(page.locator('#game-status')).toHaveText('HIDDEN LIGHT FOUND!')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jumpit-save-v1')).hiddenLights)).toEqual([
    'g03-hidden-light',
  ])

  await page.getByRole('button', { name: 'MENU' }).click()
  await expect(page.locator('#hidden-lights')).toBeVisible()
  await expect(page.locator('#hidden-light-label')).toHaveText('1 OF 5 GLOW')
  await expect(page.locator('.hidden-light-stamp.found')).toHaveCount(1)
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister()
  })
  await page.reload()
  await expect(page.locator('#hidden-lights')).toBeVisible()
  await expect(page.locator('#hidden-light-label')).toHaveText('1 OF 5 GLOW')
  await launchTrail(page)
  await page.locator('#jump').click()
  await expect(page.locator('#game-status')).not.toHaveText('HIDDEN LIGHT FOUND!')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jumpit-save-v1')).hiddenLights)).toEqual([
    'g03-hidden-light',
  ])
})

test('a Hidden Light found in a challenge keeps its stamp', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: hiddenLightGameStub }))
  await page.goto('/')
  await page.getByRole('button', { name: 'MORE' }).click()
  await page.locator('#daily-play').click()
  await page.locator('#jump').click()
  await expect(page.locator('#game-status')).toHaveText('HIDDEN LIGHT FOUND!')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jumpit-save-v1')).hiddenLights)).toEqual([
    'g03-hidden-light',
  ])
})

test('a held move control survives an overlapping ArrowRight release', async ({ page }) => {
  await page.goto('/')
  await launchTrail(page)
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
  await pointer(page, '#move-right', 'pointerdown', 8)
  await page.keyboard.down('ArrowRight')
  await page.keyboard.up('ArrowRight')
  await expect(page.locator('#move-right')).toHaveAttribute('data-held', '')
  await expect(page.locator('#seed-count')).toContainText('1/3', { timeout: 2_500 })
  await pointer(page, '#move-right', 'pointerup', 8)
  await expect(page.locator('#move-right')).not.toHaveAttribute('data-held', '')
})

test('run and a trail tap can overlap without sticking either control', async ({ page }) => {
  await page.goto('/')
  await launchTrail(page)
  await pointer(page, '#move-right', 'pointerdown', 7)
  await page.waitForTimeout(300)
  await pointer(page, '#stage-shell', 'pointerdown', 8, false)
  await page.waitForTimeout(120)
  await pointer(page, '#stage-shell', 'pointerup', 8, false)
  await expect(page.locator('#move-right')).toHaveAttribute('data-held', '')
  await page.waitForTimeout(380)
  await pointer(page, '#move-right', 'pointerup', 7)
  await expect(page.locator('#move-right')).not.toHaveAttribute('data-held', '')
  await expect(page.locator('#jump')).not.toHaveAttribute('data-held', '')
  await expect(page.locator('#stage')).toBeVisible()
})

test('trail taps, controls, keyboard, and assistive activation fire exactly once', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: inputGameStub }))
  await page.goto('/')
  await launchTrail(page)
  const read = () => page.evaluate(() => JSON.parse(document.documentElement.dataset.inputEvents || '[]'))
  const clear = () => page.evaluate(() => { document.documentElement.dataset.inputEvents = '[]' })

  await clear()
  await pointer(page, '#stage-shell', 'pointerdown', 20)
  await pointer(page, '#stage-shell', 'pointerup', 20)
  expect(await read()).toEqual(['jump:true', 'jump:false'])

  await clear()
  await pointer(page, '#stage-shell', 'pointerdown', 21)
  await pointer(page, '#stage-shell', 'pointerdown', 22, false)
  expect(await read()).toEqual(['jump:true'])
  await pointer(page, '#stage-shell', 'pointerup', 21)
  expect(await read()).toEqual(['jump:true'])
  await expect(page.locator('#jump')).toHaveAttribute('data-held', '')
  await pointer(page, '#stage-shell', 'pointerup', 22, false)
  expect(await read()).toEqual(['jump:true', 'jump:false'])
  await expect(page.locator('#jump')).not.toHaveAttribute('data-held', '')

  await clear()
  await pointer(page, '#jump', 'pointerdown', 23)
  await pointer(page, '#jump', 'pointerup', 23)
  expect(await read()).toEqual(['jump:true', 'jump:false'])

  await clear()
  await page.locator('#jump').focus()
  await page.locator('#jump').press('Space')
  await page.waitForTimeout(150)
  expect(await read()).toEqual(['jump:true', 'jump:false'])

  await clear()
  await page.locator('#move-right').evaluate(button => button.click())
  await page.waitForTimeout(150)
  expect(await read()).toEqual(['right:true', 'right:false'])

  await clear()
  await page.locator('#move-left').click()
  expect(await read()).toEqual(['left:true', 'left:false'])

  await page.getByRole('button', { name: 'pause game' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await clear()
  await pointer(page, '#game-overlay', 'pointerdown', 24)
  await pointer(page, '#game-overlay', 'pointerup', 24)
  expect(await read()).toEqual([])
})

test('browser hit-testing gives open world taps to the trail and chrome taps to chrome', async ({ page }) => {
  await page.setViewportSize({ width: 812, height: 375 })
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: inputGameStub }))
  await page.goto('/')
  await launchTrail(page)
  const read = () => page.evaluate(() => JSON.parse(document.documentElement.dataset.inputEvents || '[]'))
  const clear = () => page.evaluate(() => { document.documentElement.dataset.inputEvents = '[]' })
  const hits = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect()
    const center = selector => {
      const bounds = rect(selector)
      const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      return { ...point, hit: document.elementFromPoint(point.x, point.y)?.closest('button')?.id || null }
    }
    const safe = point => ({ ...point, hit: document.elementFromPoint(point.x, point.y)?.id || null })
    const left = rect('#move-left')
    const right = rect('#move-right')
    const jump = rect('#jump')
    const directionZone = rect('#direction-zone')
    const jumpZone = rect('#jump-zone')
    const world = { x: innerWidth / 2, y: innerHeight * .75 }
    return {
      world: { ...world, hit: document.elementFromPoint(world.x, world.y)?.id || null },
      back: center('#back'),
      pause: center('#pause'),
      left: center('#move-left'),
      right: center('#move-right'),
      jump: center('#jump'),
      safeDirections: [
        safe({ x: (left.right + right.left) / 2, y: left.top + left.height / 2 }),
        safe({ x: left.left - 16, y: left.top + left.height / 2 }),
        safe({ x: right.right + 16, y: right.top + right.height / 2 }),
        safe({ x: left.left + left.width / 2, y: left.top - 16 }),
      ],
      safeJump: [
        safe({ x: jump.left - 16, y: jump.top + jump.height / 2 }),
        safe({ x: jump.right + 16, y: jump.top + jump.height / 2 }),
        safe({ x: jump.left + jump.width / 2, y: jump.top - 16 }),
      ],
      outsideZones: [
        safe({ x: directionZone.right + 24, y: right.top + right.height / 2 }),
        safe({ x: jumpZone.left - 24, y: jump.top + jump.height / 2 }),
      ],
    }
  })
  expect(hits.world.hit).toBe('stage')
  expect([hits.back.hit, hits.pause.hit]).toEqual(['back', 'pause'])
  expect([hits.left.hit, hits.right.hit, hits.jump.hit]).toEqual(['move-left', 'move-right', 'jump'])
  expect(hits.safeDirections.map(point => point.hit)).toEqual(Array(4).fill('direction-zone'))
  expect(hits.safeJump.map(point => point.hit)).toEqual(Array(3).fill('jump-zone'))
  expect(hits.outsideZones.map(point => point.hit)).toEqual(['stage', 'stage'])

  await clear()
  await page.mouse.click(hits.world.x, hits.world.y)
  expect(await read()).toEqual(['jump:true', 'jump:false'])

  for (const point of hits.safeDirections) {
    await clear()
    await page.touchscreen.tap(point.x, point.y)
    expect((await read()).filter(event => event.startsWith('jump:'))).toEqual([])
  }

  for (const point of hits.safeJump) {
    await clear()
    await page.mouse.click(point.x, point.y)
    expect(await read()).toEqual([])
  }

  for (const point of hits.outsideZones) {
    await clear()
    await page.touchscreen.tap(point.x, point.y)
    expect(await read()).toEqual(['jump:true', 'jump:false'])
  }

  await page.mouse.click(hits.pause.x, hits.pause.y)
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  const overlay = await page.evaluate(() => {
    const point = { x: innerWidth / 2, y: innerHeight / 2 }
    const hit = document.elementFromPoint(point.x, point.y)
    return { ...point, wins: Boolean(hit?.closest('#game-overlay')) }
  })
  expect(overlay.wins).toBe(true)
  await clear()
  await page.mouse.click(overlay.x, overlay.y)
  expect(await read()).toEqual([])
})

test('beating the guardian gives the campaign a focused mobile ending with replay and home', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: endingGameStub }))
  await page.addInitScript(completed => {
    localStorage.setItem('jumpit-save-v1', JSON.stringify({
      version: 2,
      completed,
      unlocked: ['garden-1', 'keep-4'],
      bestSeeds: {},
      selectedLevel: 'keep-4',
      theme: 'garden',
      muted: true,
      dailyWins: [],
    }))
  }, completedBeforeKeep)
  await page.goto('/')
  await launchTrail(page)

  await expect(page.locator('#guardian-status')).toHaveText('WARDEN 3/3 · BELL LOCKED')
  for (let hit = 0; hit < 3; hit += 1) await page.locator('#jump').click()
  await expect(page.locator('#guardian-status')).toHaveText('WARDEN CLEARED · BELL READY')
  await page.locator('#move-right').click()

  const ending = page.getByRole('dialog')
  await expect(ending).toBeVisible()
  await expect(page.getByRole('heading', { name: 'THE GARDEN GLOWS!' })).toBeVisible()
  await expect(page.locator('#ending-art')).toBeVisible()
  await expect(page.locator('#overlay-copy')).not.toContainText('HIDDEN LIGHT')
  await expect(page.getByRole('button', { name: 'PLAY THE KEEP AGAIN' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'HOME' })).toBeFocused()
  await expect(page.locator('#game-bar')).toHaveAttribute('inert', '')
  await expect(page.locator('#controls')).toHaveAttribute('inert', '')
  await page.locator('#jump').focus()
  await expect(page.getByRole('button', { name: 'HOME' })).toBeFocused()

  const fit = await page.evaluate(() => {
    const stage = document.querySelector('.stage-shell').getBoundingClientRect()
    const card = document.querySelector('.game-card').getBoundingClientRect()
    return { stage: stage.toJSON(), card: card.toJSON(), width: innerWidth, scrollWidth: document.documentElement.scrollWidth }
  })
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.width)
  expect(fit.card.left).toBeGreaterThanOrEqual(fit.stage.left)
  expect(fit.card.right).toBeLessThanOrEqual(fit.stage.right)
  expect(fit.card.top).toBeGreaterThanOrEqual(fit.stage.top)
  expect(fit.card.bottom).toBeLessThanOrEqual(fit.stage.bottom)

  await page.getByRole('button', { name: 'PLAY THE KEEP AGAIN' }).click()
  await expect(ending).toBeHidden()
  await expect(page.locator('#game-bar')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#controls')).not.toHaveAttribute('inert', '')
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
  await expect(page.locator('#guardian-status')).toHaveText('WARDEN 3/3 · BELL LOCKED')
  for (let hit = 0; hit < 3; hit += 1) await page.locator('#jump').click()
  await page.locator('#move-right').click()
  await page.getByRole('button', { name: 'HOME' }).click()
  await expect(page.getByRole('heading', { name: 'You brought light home.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'RUN THE KEEP AGAIN' })).toBeFocused()
})

test('the ungated ending reflects partial or complete hidden light discovery', async ({ page }) => {
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: endingGameStub }))
  await page.addInitScript(({ completed, lights }) => {
    if (localStorage.getItem('jumpit-save-v1')) return
    localStorage.setItem('jumpit-save-v1', JSON.stringify({
      version: 3,
      completed,
      unlocked: ['garden-1', 'keep-4'],
      bestSeeds: {},
      selectedLevel: 'keep-4',
      theme: 'garden',
      muted: true,
      dailyWins: [],
      hiddenLights: lights,
    }))
  }, { completed: completedBeforeKeep, lights: allHiddenLights.slice(0, 2) })
  await page.goto('/')
  await launchTrail(page)
  for (let hit = 0; hit < 3; hit += 1) await page.locator('#jump').click()
  await page.locator('#move-right').click()
  await expect(page.locator('#overlay-copy')).toContainText('THE HIDDEN LIGHTS YOU FOUND TWINKLE TOO.')
  await expect(page.locator('.ending-light.found')).toHaveCount(2)

  await page.evaluate(lights => {
    const state = JSON.parse(localStorage.getItem('jumpit-save-v1'))
    state.hiddenLights = lights
    localStorage.setItem('jumpit-save-v1', JSON.stringify(state))
  }, allHiddenLights)
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister()
  })
  await page.reload()
  const replay = page.getByRole('button', { name: 'RUN THE KEEP AGAIN' })
  await expect(replay).toBeVisible()
  await expect(replay).toBeEnabled()
  await replay.dispatchEvent('click')
  for (let hit = 0; hit < 3; hit += 1) await page.locator('#jump').click()
  await page.locator('#move-right').click()
  await expect(page.locator('#overlay-copy')).toContainText('EVERY HIDDEN LIGHT JOINS THE BEACON.')
  await expect(page.locator('.ending-light.found')).toHaveCount(5)
})
