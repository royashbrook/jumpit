import { expect, test } from 'playwright/test'

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

test('production exposes no deterministic test-control hook', async ({ page }) => {
  await page.goto('/')
  const hooks = await page.evaluate(() => Object.keys(window).filter(key => /jumpit|testhook|advancegame/i.test(key)))
  expect(hooks).toEqual([])
})
