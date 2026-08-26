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
  await expect(page.locator('#trail-summary')).toHaveText('20 TRAILS · 5 PLACES')
  await expect(page.locator('.trail-button')).toHaveCount(20)
  await expect(page.locator('.region-divider')).toHaveCount(5)
  await expect(page.locator('.region-divider').last()).toHaveText('BEACON KEEP')
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
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
})

test('two-times text and phone safe-area insets keep menu and play inside the viewport', async ({ page }) => {
  await page.route('**/app.css', async route => {
    const response = await route.fetch()
    const css = (await response.text())
      .replaceAll('env(safe-area-inset-top)', '47px')
      .replaceAll('env(safe-area-inset-right)', '21px')
      .replaceAll('env(safe-area-inset-bottom)', '34px')
      .replaceAll('env(safe-area-inset-left)', '21px')
    await route.fulfill({ response, body: css })
  })
  await page.addInitScript(() => { document.documentElement.style.fontSize = '200%' })
  await page.goto('/')

  const menuFit = await page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      paddingTop: parseFloat(body.paddingTop), paddingRight: parseFloat(body.paddingRight),
      paddingBottom: parseFloat(body.paddingBottom), paddingLeft: parseFloat(body.paddingLeft),
      nav: nav.toJSON(),
    }
  })
  expect(menuFit.paddingTop).toBeGreaterThanOrEqual(47)
  expect(menuFit.paddingRight).toBeGreaterThanOrEqual(21)
  expect(menuFit.paddingBottom).toBeGreaterThanOrEqual(34)
  expect(menuFit.paddingLeft).toBeGreaterThanOrEqual(21)
  expect(menuFit.scrollWidth).toBeLessThanOrEqual(menuFit.width)
  expect(menuFit.scrollHeight).toBeLessThanOrEqual(menuFit.height)
  expect(menuFit.nav.bottom).toBeLessThanOrEqual(menuFit.height - menuFit.paddingBottom + 1)

  const play = page.getByRole('button', { name: 'PLAY THE TRAIL' })
  await expect(play).toBeVisible()
  await play.dispatchEvent('click')
  const gameFit = await page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const bar = document.querySelector('#game-bar').getBoundingClientRect()
    const stage = document.querySelector('.stage-shell').getBoundingClientRect()
    const controls = document.querySelector('#controls').getBoundingClientRect()
    const targets = [...document.querySelectorAll('#controls button, #game-bar button')].map(button => button.getBoundingClientRect().toJSON())
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      paddingRight: parseFloat(body.paddingRight), paddingBottom: parseFloat(body.paddingBottom),
      paddingLeft: parseFloat(body.paddingLeft),
      bar: bar.toJSON(), stage: stage.toJSON(), controls: controls.toJSON(), targets,
    }
  })
  expect(gameFit.scrollWidth).toBeLessThanOrEqual(gameFit.width)
  expect(gameFit.scrollHeight).toBeLessThanOrEqual(gameFit.height)
  for (const rect of [gameFit.bar, gameFit.stage, gameFit.controls]) {
    expect(rect.left).toBeGreaterThanOrEqual(gameFit.paddingLeft - 1)
    expect(rect.right).toBeLessThanOrEqual(gameFit.width - gameFit.paddingRight + 1)
  }
  expect(gameFit.controls.bottom).toBeLessThanOrEqual(gameFit.height - gameFit.paddingBottom + 1)
  expect(gameFit.stage.height).toBeGreaterThan(80)
  for (const target of gameFit.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)
  }
})

test('reduced motion removes the status animation without hiding pause feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).dispatchEvent('click')
  await page.getByRole('button', { name: 'pause game' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  const motion = await page.locator('#game-status').evaluate(element => ({
    animationName: getComputedStyle(element).animationName,
    animationDuration: getComputedStyle(element).animationDuration,
  }))
  expect(motion.animationName).toBe('none')
  expect(parseFloat(motion.animationDuration)).toBeLessThanOrEqual(.01)
})
