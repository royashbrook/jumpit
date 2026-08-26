import { expect, test } from 'playwright/test'

const pointer = (page, selector, type) => page.dispatchEvent(selector, type, { pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: type === 'pointerdown' ? 1 : 0 })

const completedBeforeKeep = [
  'garden-1', 'garden-2', 'garden-3', 'garden-4',
  'rooftop-1', 'rooftop-2', 'rooftop-3', 'rooftop-4',
  'workshop-1', 'workshop-2', 'workshop-3', 'workshop-4',
  'market-1', 'market-2', 'market-3', 'market-4',
  'keep-1', 'keep-2', 'keep-3',
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

test('the opening run pays off immediately with a seed and a visible creature', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await pointer(page, '#move-right', 'pointerdown')
  await page.waitForTimeout(850)
  await pointer(page, '#move-right', 'pointerup')
  await expect(page.locator('#seed-count')).toContainText('1/4')
  await expect(page.locator('#stage')).toBeVisible()
})

test('run and jump can overlap on touch without sticking either control', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await pointer(page, '#move-right', 'pointerdown')
  await page.waitForTimeout(300)
  await pointer(page, '#jump', 'pointerdown')
  await page.waitForTimeout(120)
  await pointer(page, '#jump', 'pointerup')
  await page.waitForTimeout(380)
  await pointer(page, '#move-right', 'pointerup')
  await expect(page.locator('#move-right')).not.toHaveAttribute('data-held', '')
  await expect(page.locator('#jump')).not.toHaveAttribute('data-held', '')
  await expect(page.locator('#stage')).toBeVisible()
})

test('beating the guardian gives the campaign a focused mobile ending with replay and home', async ({ page }) => {
  await page.route('**/game.js', route => route.fulfill({ contentType: 'text/javascript', body: endingGameStub }))
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
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()

  await expect(page.locator('#guardian-status')).toHaveText('WARDEN 3/3 · BELL LOCKED')
  for (let hit = 0; hit < 3; hit += 1) await page.locator('#jump').click()
  await expect(page.locator('#guardian-status')).toHaveText('WARDEN CLEARED · BELL READY')
  await page.locator('#move-right').click()

  const ending = page.getByRole('dialog')
  await expect(ending).toBeVisible()
  await expect(page.getByRole('heading', { name: 'THE GARDEN GLOWS!' })).toBeVisible()
  await expect(page.locator('#ending-art')).toBeVisible()
  await expect(page.getByRole('button', { name: 'PLAY THE KEEP AGAIN' })).toBeVisible()
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
  await expect(page.locator('#guardian-status')).toHaveText('WARDEN 3/3 · BELL LOCKED')
  for (let hit = 0; hit < 3; hit += 1) await page.locator('#jump').click()
  await page.locator('#move-right').click()
  await page.getByRole('button', { name: 'HOME' }).click()
  await expect(page.getByRole('heading', { name: 'You brought light home.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'RUN THE KEEP AGAIN' })).toBeFocused()
})
