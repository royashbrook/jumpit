import { expect, test } from 'playwright/test'

test('portrait shell stays inside the phone and keeps navigation visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'game menu' })).toBeVisible()

  const shell = await page.evaluate(() => ({
    innerWidth,
    innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    nav: document.querySelector('.bottom-nav').getBoundingClientRect().toJSON(),
  }))
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.innerWidth)
  expect(shell.scrollHeight).toBeLessThanOrEqual(shell.innerHeight)
  expect(shell.nav.bottom).toBeLessThanOrEqual(shell.innerHeight)

  await page.getByRole('button', { name: 'TRAILS' }).click()
  await expect(page.locator('.trail-button')).toHaveCount(12)
  await expect(page.getByRole('navigation', { name: 'game menu' })).toBeVisible()
})

test('game controls and pause remain readable without hiding the world', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  for (const name of ['move left', 'move right', 'jump', 'pause game']) {
    const button = page.getByRole('button', { name })
    const box = await button.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('button', { name: 'pause game' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'KEEP GOING' })).toBeVisible()
  await page.getByRole('button', { name: 'START OVER' }).click()
  await expect(page.getByRole('button', { name: 'pause game' })).toBeVisible()
})
