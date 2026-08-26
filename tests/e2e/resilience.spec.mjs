import { expect, test } from 'playwright/test'
import { dailyChallenge } from '../../daily.js'
import { LEVELS } from '../../levels.js'

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
