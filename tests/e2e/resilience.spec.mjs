import { expect, test } from 'playwright/test'
import { dailyChallenge } from '../../daily.js'
import { LEVELS } from '../../levels.js'

const lifecycleAudioStub = `
export function createAudio() {
  const mark = value => { document.documentElement.dataset.audioState = value }
  const markMusic = value => { document.documentElement.dataset.musicState = value ? 'playing' : 'paused' }
  return {
    startFromGesture() { mark('running'); return Promise.resolve(true) },
    suspend() { mark('suspended'); return Promise.resolve(true) },
    cue(name) {
      const cues = JSON.parse(document.documentElement.dataset.audioCues || '[]')
      cues.push(name)
      document.documentElement.dataset.audioCues = JSON.stringify(cues)
      return true
    },
    setMusicPlaying(value) { markMusic(value); return value },
    setMuted(value) { return value }, isMuted() { return false }, stop() {},
  }
}
`

const lifecycleGameStub = `
export function createGame(_canvas, onState = () => {}, onCue = () => {}) {
  let finished = false
  let paused = false
  const report = message => {
    document.documentElement.dataset.lifecycleGameState = finished ? 'finished' : paused ? 'paused' : 'running'
    onState({
      levelId: 'garden-1', levelName: 'Dewdrop Dash', regionName: 'Garden Walk',
      seeds: 0, maxSeeds: 3, paused, finished, message,
    })
  }
  const start = () => { finished = false; paused = false; report('') }
  return {
    start, restart: start, stop() {}, resize() {}, clearInput() {},
    setInput(action, value) {
      if (document.documentElement.dataset.finishOnRight !== 'armed' || action !== 'right' || !value || finished) return
      finished = true
      onCue('finish')
      report('TRAIL CLEARED!')
    },
    togglePause() { paused = !paused; onCue('pause'); report(paused ? 'PAUSED' : 'GO!'); return paused },
    pause() {
      if (paused || finished) return paused
      paused = true
      onCue('pause')
      report('PAUSED')
      return paused
    },
  }
}
`

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
  await expect(page.locator('#continue-label')).toHaveText('DEWDROP DASH · 3/3 SEEDS')
  await page.getByRole('button', { name: 'TRAILS' }).click()
  await expect(page.getByRole('button', { name: 'Play Dewdrop Dash' })).toContainText('◆ 3/3')
  await expect(page.locator('body')).not.toContainText('4/3')
})

test('a shared seed previews its deterministic challenge without touching campaign progress', async ({ page }) => {
  const seed = 48151623
  const challenge = dailyChallenge(seed)
  const level = LEVELS.find(candidate => candidate.id === challenge.levelId)
  const baseline = {
    version: 2,
    completed: [],
    unlocked: ['garden-1'],
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
  await page.route('**/audio.js*', route => route.fulfill({ contentType: 'text/javascript', body: lifecycleAudioStub }))
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: lifecycleGameStub }))
  await page.goto('/')
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
  await page.route('**/audio.js*', route => route.fulfill({ contentType: 'text/javascript', body: lifecycleAudioStub }))
  await page.goto('/')
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
  await page.route('**/audio.js*', route => route.fulfill({ contentType: 'text/javascript', body: lifecycleAudioStub }))
  await page.route('**/game.js*', route => route.fulfill({ contentType: 'text/javascript', body: lifecycleGameStub }))
  await page.goto('/')
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
  await page.route('**/audio.js*', route => route.fulfill({ contentType: 'text/javascript', body: lifecycleAudioStub }))
  await page.goto('/')
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
