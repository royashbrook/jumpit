import { expect, test } from 'playwright/test'

test('portrait shell stays inside the phone and keeps navigation visible', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'game menu' })).toBeVisible()
  await expect(page.locator('#play-panel button')).toHaveCount(1)
  await expect(page.locator('#play-panel #daily-card')).toHaveCount(0)

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
  await expect(page.locator('.trail-button')).toHaveCount(4)
  await expect(page.locator('.region-divider')).toHaveCount(1)
  await expect(page.locator('.region-divider')).toHaveText('GARDEN WALK')
  await expect(page.locator('.sleeping-place')).toHaveCount(4)
  await expect(page.locator('.sleeping-place').first()).toContainText('ROOFTOP RAIN')
  await expect(page.locator('.sleeping-place').first()).toContainText('CLEAR GARDEN WALK TO WAKE')
  await expect(page.getByRole('navigation', { name: 'game menu' })).toBeVisible()
})

test('all four looks keep every text token pair at WCAG AA contrast', async ({ page }) => {
  await page.goto('/')
  const ratios = await page.evaluate(() => {
    const themes = ['garden', 'dusk', 'rain', 'lantern']
    const pairs = [
      ['ink', 'surface'], ['ink', 'surface-raised'],
      ['ink-dim', 'surface'], ['ink-dim', 'surface-raised'],
      ['ink-on-accent', 'accent'], ['ink-on-accent', 'warn'],
      ['accent-dim', 'surface'], ['accent-dim', 'surface-raised'],
    ]
    const luminance = value => {
      const hex = value.trim().replace('#', '')
      const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
        .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
    }
    const contrast = (first, second) => {
      const a = luminance(first)
      const b = luminance(second)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    }
    const results = []
    for (const theme of themes) {
      document.documentElement.dataset.theme = theme
      const style = getComputedStyle(document.documentElement)
      for (const [foreground, background] of pairs) {
        results.push({
          theme,
          pair: `${foreground}/${background}`,
          ratio: contrast(style.getPropertyValue(`--${foreground}`), style.getPropertyValue(`--${background}`)),
        })
      }
    }
    return results
  })

  for (const result of ratios) expect(result.ratio, `${result.theme} ${result.pair}`).toBeGreaterThanOrEqual(4.5)
})

test('discovered Hidden Lights fit Home at two-times text without becoming a menu', async ({ page }) => {
  const lights = [
    'g03-hidden-light', 'r03-hidden-light', 'w02-hidden-light',
    'm03-hidden-light', 'k01-hidden-light',
  ]
  await page.goto('/')
  await page.evaluate(light => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 3,
    completed: [],
    unlocked: ['garden-1'],
    bestSeeds: {},
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: true,
    dailyWins: [],
    hiddenLights: [light],
  })), lights[0])
  await page.addInitScript(() => { document.documentElement.style.fontSize = '200%' })
  await page.reload()

  await expect(page.locator('#hidden-lights')).toBeVisible()
  await expect(page.locator('#hidden-light-label')).toHaveText('1 OF 5 GLOW')
  await expect(page.locator('#hidden-lights button, #hidden-lights a')).toHaveCount(0)
  const fit = await page.evaluate(() => {
    const strip = document.querySelector('#hidden-lights').getBoundingClientRect()
    const stamps = [...document.querySelectorAll('.hidden-light-stamp')].map(stamp => stamp.getBoundingClientRect().toJSON())
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, strip: strip.toJSON(), stamps }
  })
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.width)
  for (const stamp of fit.stamps) {
    expect(stamp.left).toBeGreaterThanOrEqual(fit.strip.left)
    expect(stamp.right).toBeLessThanOrEqual(fit.strip.right)
  }

  await page.evaluate(all => {
    const state = JSON.parse(localStorage.getItem('jumpit-save-v1'))
    state.hiddenLights = all
    localStorage.setItem('jumpit-save-v1', JSON.stringify(state))
  }, lights)
  await page.reload()
  await expect(page.locator('#hidden-light-label')).toHaveText('ALL FIVE GLOW')
  await expect(page.locator('.hidden-light-stamp.found')).toHaveCount(5)
})

test('Trails expands reached places while future places stay compact and readable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 2,
    completed: ['garden-1', 'garden-2', 'garden-3', 'garden-4'],
    unlocked: ['garden-1', 'garden-2', 'garden-3', 'garden-4', 'rooftop-1'],
    bestSeeds: {},
    selectedLevel: 'rooftop-1',
    theme: 'garden',
    muted: true,
    dailyWins: [],
  })))
  await page.goto('/')
  await page.getByRole('button', { name: 'TRAILS' }).click()
  await expect(page.locator('.trail-button')).toHaveCount(8)
  await expect(page.locator('.region-divider')).toHaveText(['GARDEN WALK', 'ROOFTOP RAIN'])
  await expect(page.locator('.sleeping-place')).toHaveCount(3)
  await expect(page.locator('.sleeping-place').first()).toContainText('WORKSHOP LOFT')
  await expect(page.locator('.sleeping-place').first()).toContainText('CLEAR ROOFTOP RAIN TO WAKE')
  await expect(page.getByRole('button', { name: 'Thunder Terrace locked' })).toBeDisabled()
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
