import { expect, test } from 'playwright/test'

const pointer = (page, selector, type) => page.dispatchEvent(selector, type, { pointerId: 7, pointerType: 'touch', isPrimary: true, buttons: type === 'pointerdown' ? 1 : 0 })

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
