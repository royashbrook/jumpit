import { expect, test } from 'playwright/test'

test('the installed shell is controlled and carries a complete offline cache', async ({ page, context, browserName }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  if (browserName === 'webkit') {
    const proof = await page.evaluate(async () => ({
      controlled: Boolean(navigator.serviceWorker.controller),
      shell: Boolean(await caches.match('./index.html')),
      game: Boolean(await caches.match('./game.js')),
      art: Boolean(await caches.match('./assets/backgrounds/garden-walk.png')),
    }))
    expect(proof).toEqual({ controlled: true, shell: true, game: true, art: true })
    return
  }
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  await context.setOffline(false)
})

test('the update probe is network-fresh and reveals the reload banner', async ({ page }) => {
  let body = '<html>release-a</html>'
  await page.route('**/*update-probe*', route => route.fulfill({ status: 200, contentType: 'text/html', body }))
  await page.goto('/')
  await page.waitForTimeout(150)
  body = '<html>release-b</html>'
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('#update')).toBeVisible()
})

test('delayed art cannot block the playable shell', async ({ page }) => {
  await page.route('**/assets/**/*.png', async route => {
    await new Promise(resolve => setTimeout(resolve, 450))
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  await expect(page.getByRole('button', { name: 'jump' })).toBeEnabled()
})
