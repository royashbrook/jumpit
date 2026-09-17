import { expect, test } from 'playwright/test'
import { openHarness } from '../harness/open.mjs'
import { dailyChallenge } from '../../src/daily.ts'
import { LEVELS } from '../../src/levels.ts'

test('theme selection survives reload and remount', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'LOOKS' }).click()
  await page.locator('#look-dusk').click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dusk')
  await page.close()
  const remount = await context.newPage()
  await remount.goto('/')
  await expect(remount.locator('html')).toHaveAttribute('data-theme', 'dusk')
})

test('corrupt and blocked storage never block play', async ({ browser, baseURL }) => {
  const corruptContext = await browser.newContext()
  const corrupt = await corruptContext.newPage()
  await corrupt.addInitScript(() => localStorage.setItem('jumpit-save-v1', '{broken'))
  await corrupt.goto(baseURL)
  await expect(corrupt.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  await corruptContext.close()

  const context = await browser.newContext()
  await context.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    Storage.prototype.setItem = () => { throw new Error('blocked') }
  })
  const blocked = await context.newPage()
  await blocked.goto(baseURL)
  await blocked.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(blocked.locator('#stage')).toBeVisible()
  await context.close()
})

test('a v1.7 four-seed opening score never renders as an impossible 4/3', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 2,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: { 'garden-1': 4 },
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: true,
    dailyWins: [],
  })))
  await page.goto('/')
  await expect(page.locator('#continue-label')).toHaveText('DEWDROP DASH · 🔔 GOLD BELL')
  await expect(page.locator('#gold-bell-count')).toHaveText('🔔 1 OF 20 GOLD BELLS')
  await page.getByRole('button', { name: 'TRAILS' }).click()
  await expect(page.getByRole('button', { name: 'Play Dewdrop Dash, Gold Bell earned' })).toContainText('GOLD BELL EARNED')
  await expect(page.locator('body')).not.toContainText('4/3')
})

test('a shared seed previews its deterministic challenge without touching campaign progress', async ({ page }) => {
  const seed = 48151623
  const challenge = dailyChallenge(seed)
  const level = LEVELS.find(candidate => candidate.id === challenge.levelId)
  const baseline = {
    version: 2,
    completed: [],
    unlocked: ['garden-1', challenge.levelId],
    bestSeeds: {},
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: false,
    dailyWins: [],
  }
  await page.addInitScript(value => localStorage.setItem('jumpit-save-v1', JSON.stringify(value)), baseline)
  await page.goto(`/?seed=${seed}`)

  await expect(page.locator('[data-tab="more"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#daily-card')).toBeVisible()
  await expect(page.locator('#daily-kicker')).toHaveText('FRIEND CHALLENGE')
  await expect(page.locator('#daily-title')).toHaveText(challenge.title)
  await expect(page.locator('#daily-copy')).toHaveText(challenge.copy)
  await expect(page.locator('#daily-status')).toHaveText(`◆ ${challenge.goalSeeds} SEEDS + BELL`)
  await expect(page.locator('#trail-summary')).toHaveText('20 TRAILS · 5 PLACES')

  await page.locator('#daily-play').click()
  await expect(page.locator('#level-name')).toHaveText(level.name.toUpperCase())
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jumpit-save-v1')))).toEqual(baseline)
})

test('a perfect challenge earns its stamp without minting a campaign Gold Bell', async ({ page }) => {
  // A fixed seed with its trail unlocked: a locked challenge trail no longer starts.
  await page.addInitScript(() => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 3,
    completed: ['garden-1'],
    unlocked: ['garden-1', 'garden-2'],
    bestSeeds: {},
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: false,
    dailyWins: [],
    hiddenLights: [],
  })))
  await openHarness(page, { game: 'lifecycle', audio: 'lifecycle', seed: '20260909' })
  await page.getByRole('button', { name: 'MORE' }).click()
  await expect(page.locator('#daily-title')).toHaveText('SEEDLING SPRINT')
  await page.locator('html').evaluate(element => {
    element.dataset.finishOnRight = 'armed'
    element.dataset.perfectFinish = 'armed'
  })
  await page.locator('#daily-play').click()
  await page.locator('#move-right').evaluate(button => button.click())
  await expect(page.locator('#overlay-title')).toHaveText('STAMP EARNED!')

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jumpit-save-v1')))
  expect(saved.completed).toEqual(['garden-1'])
  expect(saved.bestSeeds).toEqual({})
  expect(saved.dailyWins).toHaveLength(1)

  await page.locator('#ending-home').click()
  await expect(page.locator('#gold-bell-count')).toHaveText('ALL SEEDS + BELL = GOLD BELL')
  await page.getByRole('button', { name: 'TRAILS' }).click()
  await expect(page.getByRole('button', { name: 'Play Dewdrop Dash' })).not.toContainText('GOLD BELL')
})

test('Rain and Lantern looks unlock from their campaign milestones and persist', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'LOOKS' }).click()
  await expect(page.locator('#look-rain')).toBeDisabled()
  await expect(page.locator('#look-lantern')).toBeDisabled()

  await page.evaluate(() => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 2,
    completed: ['rooftop-4'],
    unlocked: ['garden-1'],
    bestSeeds: {},
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: false,
    dailyWins: [],
  })))
  await page.reload()
  await page.getByRole('button', { name: 'LOOKS' }).click()
  await expect(page.locator('#look-rain')).toBeEnabled()
  await expect(page.locator('#look-lantern')).toBeDisabled()
  await page.locator('#look-rain').click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'rain')

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('jumpit-save-v1'))
    save.completed.push('market-4')
    localStorage.setItem('jumpit-save-v1', JSON.stringify(save))
  })
  await page.reload()
  await page.getByRole('button', { name: 'LOOKS' }).click()
  await expect(page.locator('#look-lantern')).toBeEnabled()
  await page.locator('#look-lantern').click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'lantern')
})

test('production exposes no deterministic test-control hook', async ({ page }) => {
  await page.goto('/')
  const hooks = await page.evaluate(() => Object.keys(window).filter(key => /jumpit|testhook|advancegame/i.test(key)))
  expect(hooks).toEqual([])
})

test('the iOS install hint cannot overwrite the normal gameplay help', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto(baseURL)
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()
  await page.setViewportSize({ width: 844, height: 390 })
  await page.getByRole('button', { name: 'MORE' }).click()
  await page.getByRole('button', { name: 'ADD TO HOME SCREEN' }).click()
  await expect(page.getByRole('heading', { name: 'Add to home screen' })).toBeVisible()
  await page.getByRole('button', { name: 'GOT IT' }).click()

  await page.getByRole('button', { name: 'HOW TO PLAY' }).click()
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible()
  await expect(page.getByText('Touch the left side, then slide to run.', { exact: true })).toBeVisible()
  await expect(page.getByText('Tap the right side to jump.', { exact: true })).toBeVisible()
  await context.close()
})

test('blur, pagehide, and hidden visibility pause, release input, and wait for explicit audio resume', async ({ page }) => {
  await openHarness(page, { audio: 'lifecycle', game: 'lifecycle' })
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle-game-state', 'running')
  await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'running')
  await expect(page.locator('html')).toHaveAttribute('data-music-state', 'playing')

  const interrupt = async eventName => {
    for (const selector of ['#move-left', '#move-right', '#jump']) {
      await page.dispatchEvent(selector, 'pointerdown', { pointerId: selector.length, pointerType: 'touch', isPrimary: true, buttons: 1 })
      await expect(page.locator(selector)).toHaveAttribute('data-held', '')
    }
    await page.evaluate(name => {
      if (name === 'visibilitychange') Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      ;(name === 'visibilitychange' ? document : window).dispatchEvent(new Event(name))
    }, eventName)
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-lifecycle-game-state', 'paused')
    await expect(page.getByRole('button', { name: 'KEEP GOING' })).toBeFocused()
    await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'suspended')
    await expect(page.locator('html')).toHaveAttribute('data-music-state', 'paused')
    for (const selector of ['#move-left', '#move-right', '#jump']) await expect(page.locator(selector)).not.toHaveAttribute('data-held', '')
    await expect(page.locator('#game-bar')).toHaveAttribute('inert', '')
    await expect(page.locator('#controls')).toHaveAttribute('inert', '')
    await page.locator('#jump').focus()
    await expect(page.getByRole('button', { name: 'KEEP GOING' })).toBeFocused()
  }

  await interrupt('blur')
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'suspended')
  await page.getByRole('button', { name: 'KEEP GOING' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle-game-state', 'running')
  await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'running')
  await expect(page.locator('html')).toHaveAttribute('data-music-state', 'playing')
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()

  await interrupt('pagehide')
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'suspended')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await page.getByRole('button', { name: 'KEEP GOING' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle-game-state', 'running')

  await interrupt('visibilitychange')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'suspended')
  await page.getByRole('button', { name: 'KEEP GOING' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-lifecycle-game-state', 'running')
  await expect(page.locator('html')).toHaveAttribute('data-audio-state', 'running')
  await expect(page.locator('#game-bar')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#controls')).not.toHaveAttribute('inert', '')
})

test('keyboard pause and resume never leak a jump into the real game', async ({ page }) => {
  await openHarness(page, { audio: 'lifecycle' })
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await page.getByRole('button', { name: 'pause game' }).click()
  const resume = page.getByRole('button', { name: 'KEEP GOING' })
  await expect(resume).toBeFocused()
  await page.evaluate(() => { document.documentElement.dataset.audioCues = '[]' })
  await resume.press('Space')
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
  await page.waitForTimeout(100)
  const cues = await page.evaluate(() => JSON.parse(document.documentElement.dataset.audioCues || '[]'))
  expect(cues).not.toContain('jump')

  const pause = page.getByRole('button', { name: 'pause game' })
  await page.evaluate(() => { document.documentElement.dataset.audioCues = '[]' })
  await pause.press('Space')
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await page.waitForTimeout(100)
  const pauseCues = await page.evaluate(() => JSON.parse(document.documentElement.dataset.audioCues || '[]'))
  expect(pauseCues).not.toContain('jump')
})

test('music stops at Home and when the trail finishes', async ({ page }) => {
  await openHarness(page, { audio: 'lifecycle', game: 'lifecycle' })
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await expect(page.locator('html')).toHaveAttribute('data-music-state', 'playing')

  await page.getByRole('button', { name: 'MENU' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-music-state', 'paused')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await expect(page.locator('html')).toHaveAttribute('data-music-state', 'playing')

  await page.evaluate(() => { document.documentElement.dataset.audioCues = '[]' })
  await page.locator('html').evaluate(root => { root.dataset.finishOnRight = 'armed' })
  await page.dispatchEvent('#move-right', 'pointerdown', {
    pointerId: 17, pointerType: 'touch', isPrimary: true, buttons: 1,
  })
  await expect(page.getByRole('heading', { name: 'TRAIL CLEARED!' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-music-state', 'paused')
  const cues = await page.evaluate(() => JSON.parse(document.documentElement.dataset.audioCues || '[]'))
  expect(cues).toContain('finish')
})

test('a right-side jump on the interruption frame cannot fire after explicit resume', async ({ page }) => {
  await openHarness(page, { audio: 'lifecycle' })
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await page.evaluate(() => {
    document.querySelector('#jump').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 11, pointerType: 'touch', isPrimary: true, buttons: 1,
      clientX: innerWidth * .75, clientY: innerHeight * .7,
    }))
    window.dispatchEvent(new Event('blur'))
  })
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await page.evaluate(() => { document.documentElement.dataset.audioCues = '[]' })
  await page.getByRole('button', { name: 'KEEP GOING' }).click()
  await page.waitForTimeout(180)
  const cues = await page.evaluate(() => JSON.parse(document.documentElement.dataset.audioCues || '[]'))
  expect(cues).toContain('pause')
  expect(cues).not.toContain('jump')
})

test('unmount cancels a queued trail start before a fresh shell mounts', async ({ page }) => {
  await openHarness(page, { game: 'input', audio: 'lifecycle' })
  await page.evaluate(async () => {
    document.querySelector('#play').click()
    await window.jumpitHarness.unmount()
  })
  await expect(page.locator('#app')).toBeEmpty()
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-destroyed', '1')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-disposed', '1')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.locator('html').getAttribute('data-harness-game-starts')).toBeNull()
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.audioCues || '[]'))).not.toContain('start')

  await page.evaluate(() => window.jumpitHarness.mount())
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-calls', '2')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-calls', '2')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await expect(page.locator('#stage')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-starts', '1')
  await page.evaluate(async () => {
    await window.jumpitHarness.unmount()
    await window.jumpitHarness.unmount()
  })
  await expect(page.locator('#app')).toBeEmpty()
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-destroyed', '2')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-disposed', '2')
})

test('unmount releases controls and listeners, closes dialogs, and remounts without duplicate input', async ({ page }) => {
  await openHarness(page, { game: 'input', audio: 'lifecycle' })
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await expect(page.locator('#stage')).toBeVisible()
  const oldStage = await page.locator('#stage').elementHandle()
  const oldDirectionZone = await page.locator('#direction-zone').elementHandle()
  await page.evaluate(async () => {
    // Assistive activation arms the real shell's delayed input-release timer.
    document.querySelector('#move-right').click()
    await window.jumpitHarness.unmount()
  })
  await expect(page.locator('#app')).toBeEmpty()
  expect(await oldStage.evaluate(node => node.isConnected)).toBe(false)
  expect(await oldDirectionZone.evaluate(node => node.dispatchEvent(new MouseEvent('click', { cancelable: true })))).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-destroyed', '1')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-disposed', '1')
  const released = await page.evaluate(() => JSON.parse(document.documentElement.dataset.inputEvents || '[]'))
  expect(released).toContain('right:true')
  expect(released.at(-1)).toBe('jump:false')
  expect(released.lastIndexOf('right:false')).toBeGreaterThan(released.lastIndexOf('right:true'))
  await page.keyboard.press('Space')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 51 }))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(160)
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.inputEvents || '[]'))).toEqual(released)

  await page.evaluate(() => window.jumpitHarness.mount())
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-calls', '2')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-calls', '2')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await expect(page.locator('#stage')).toBeVisible()
  await expect(page.locator('#pause')).toBeFocused()
  await page.evaluate(() => {
    document.activeElement.blur()
    document.documentElement.dataset.inputEvents = '[]'
  })
  await page.keyboard.press('Space')
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.inputEvents || '[]'))).toEqual(['jump:true', 'jump:false'])
  await page.evaluate(() => { document.documentElement.dataset.inputEvents = '[]' })
  await page.dispatchEvent('#move-right', 'pointerdown', { pointerId: 52, pointerType: 'touch', isPrimary: true, buttons: 1 })
  await page.dispatchEvent('#move-right', 'pointerup', { pointerId: 52, pointerType: 'touch', isPrimary: true, buttons: 0 })
  expect(await page.evaluate(() => JSON.parse(document.documentElement.dataset.inputEvents || '[]'))).toEqual(['right:true', 'right:false'])

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#rotate-device')).toBeVisible()
  await expect(page.locator('body')).toHaveClass(/orientation-blocked/)
  await page.evaluate(() => window.jumpitHarness.unmount())
  await expect(page.locator('#app')).toBeEmpty()
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveClass(/orientation-blocked/)
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-destroyed', '2')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-disposed', '2')
})
