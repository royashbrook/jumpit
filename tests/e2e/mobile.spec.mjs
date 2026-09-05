import { expect, test } from 'playwright/test'
import { dailyChallenge } from '../../daily.js'
import { LEVELS } from '../../levels.js'

test('portrait entry requires landscape before exposing the one-action Home', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()
  await expect(page.locator('#rotate-title')).toBeFocused()
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeHidden()
  await expect(page.locator('#menu')).toHaveAttribute('inert', '')
  await expect(page.locator('#update')).toHaveAttribute('inert', '')
  await expect(page.locator('.bottom-nav')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(page.locator('#rotate-device')).toHaveAttribute('open', '')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'ABOUT' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'ABOUT' })).toBeFocused()
  await page.getByRole('button', { name: 'ABOUT' }).click()
  await expect(page.getByRole('heading', { name: 'About Jumpit' })).toBeVisible()
  await page.getByRole('button', { name: 'BACK' }).click()

  await page.setViewportSize({ width: 812, height: 375 })
  await expect(page.locator('#rotate-device')).toBeHidden()
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'game menu' })).toBeVisible()
  await expect(page.locator('#play-panel button')).toHaveCount(1)
  await expect(page.locator('#play-panel #daily-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /PLAY/i })).toHaveCount(1)

  const shell = await page.evaluate(() => ({
    innerWidth,
    innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    nav: document.querySelector('.menu-nav').getBoundingClientRect().toJSON(),
  }))
  expect(shell.scrollWidth).toBeLessThanOrEqual(shell.innerWidth)
  expect(shell.scrollHeight).toBeLessThanOrEqual(shell.innerHeight)
  expect(shell.nav.top).toBeGreaterThanOrEqual(0)
  expect(shell.nav.bottom).toBeLessThanOrEqual(shell.innerHeight)

  await page.getByRole('button', { name: 'TRAILS' }).click()
  await expect(page.locator('#trail-summary')).toHaveText('20 TRAILS · 5 PLACES')
  await expect(page.locator('.trail-button')).toHaveCount(4)
  await expect(page.locator('.region-divider')).toHaveCount(1)
  await expect(page.locator('.region-divider')).toHaveText('GARDEN WALK')
  await expect(page.locator('.sleeping-place')).toHaveCount(4)
  await expect(page.locator('.sleeping-place').first()).toContainText('ROOFTOP RAIN')
  await expect(page.locator('.sleeping-place').first()).toContainText('CLEAR GARDEN WALK TO WAKE')
  await page.getByRole('button', { name: 'HOME' }).click()
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
})

test('the portrait gate names the game and says whether a trail is paused', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/')
  const gate = page.locator('#rotate-device')
  await expect(gate).toHaveAttribute('open', '')
  await expect(gate.locator('.rotate-brand img')).toBeVisible()
  await expect(gate.locator('.rotate-name')).toHaveText('Jumpit')
  await expect(gate.locator('.rotate-tagline')).toHaveText('run the lantern trail')
  await expect(page.locator('#rotate-kicker')).toHaveText('MORE TRAIL AHEAD')
  await expect(page.locator('#rotate-copy')).toContainText('Turn your phone sideways to play.')
  await expect(page.locator('#rotate-title')).toBeFocused()
  await expect(page.locator('#rotate-title')).toHaveCSS('outline-style', 'none')

  await page.setViewportSize({ width: 932, height: 430 })
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  await page.setViewportSize({ width: 430, height: 932 })
  await expect(page.locator('#rotate-kicker')).toHaveText('PAUSED')
  await expect(page.locator('#rotate-copy')).toContainText('Turn your phone sideways to keep going.')
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeVisible()

  await page.getByRole('button', { name: 'EXIT TO HOME' }).click()
  await expect(page.locator('#game')).toBeHidden()
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeHidden()
  await expect(page.locator('#rotate-kicker')).toHaveText('MORE TRAIL AHEAD')
  await expect(page.locator('#rotate-copy')).toContainText('Turn your phone sideways to play.')
  await expect(page.locator('#rotate-title')).toBeFocused()
  await expect(page.locator('#rotate-title')).toHaveCSS('outline-style', 'none')
})

test('the portrait gate supersedes an open Home dialog', async ({ page }) => {
  await page.setViewportSize({ width: 912, height: 420 })
  await page.goto('/')
  await page.getByRole('button', { name: 'MORE' }).click()
  await page.getByRole('button', { name: 'HOW TO PLAY' }).click()
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('#howto')).not.toHaveAttribute('open', '')
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()
  await expect(page.locator('#rotate-title')).toBeFocused()
})

test('rotating landscape while portrait About is open returns focus to Home', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'ABOUT' }).click()
  await expect(page.getByRole('heading', { name: 'About Jumpit' })).toBeVisible()

  await page.setViewportSize({ width: 812, height: 375 })
  await expect(page.locator('#about')).not.toHaveAttribute('open', '')
  await expect(page.locator('#rotate-device')).not.toHaveAttribute('open', '')
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeFocused()
})

test('one landscape Play tap starts a full-screen iPhone Air trail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let courierRequests = 0
  page.on('request', request => {
    if (request.url().endsWith('/assets/sprites/courier-sheet.webp')) courierRequests += 1
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()
  expect(courierRequests).toBe(0)

  await page.setViewportSize({ width: 812, height: 375 })
  await expect(page.locator('#rotate-device')).toBeHidden()
  expect(courierRequests).toBe(0)
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
  await expect.poll(() => courierRequests).toBeGreaterThan(0)

  const fit = await page.evaluate(() => {
    const game = document.querySelector('#game').getBoundingClientRect()
    const bar = document.querySelector('#game-bar').getBoundingClientRect()
    const stage = document.querySelector('.stage-shell').getBoundingClientRect()
    const controls = document.querySelector('#controls').getBoundingClientRect()
    const canvas = document.querySelector('#stage')
    const left = document.querySelector('#move-left').getBoundingClientRect()
    const right = document.querySelector('#move-right').getBoundingClientRect()
    const jump = document.querySelector('#jump').getBoundingClientRect()
    const stick = document.querySelector('#move-stick').getBoundingClientRect()
    const jumpFeedback = document.querySelector('.jump-feedback').getBoundingClientRect()
    const directionZone = document.querySelector('#direction-zone').getBoundingClientRect()
    const jumpZone = document.querySelector('#jump-zone').getBoundingClientRect()
    const backgroundAlpha = selector => {
      const channels = getComputedStyle(document.querySelector(selector)).backgroundColor.match(/[\d.]+/g)?.map(Number) || []
      return channels.length > 3 ? channels.at(-1) : 1
    }
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      game: game.toJSON(),
      bar: bar.toJSON(),
      stage: stage.toJSON(),
      controls: controls.toJSON(),
      canvas: [canvas.width, canvas.height],
      left: left.toJSON(), right: right.toJSON(), jump: jump.toJSON(),
      stick: stick.toJSON(), jumpFeedback: jumpFeedback.toJSON(),
      directionZone: directionZone.toJSON(),
      jumpZone: jumpZone.toJSON(),
      visualAlpha: ['#move-stick', '.jump-feedback'].map(backgroundAlpha),
      visualOpacity: ['#move-stick', '.jump-feedback']
        .map(selector => Number(getComputedStyle(document.querySelector(selector)).opacity)),
      directionOpacity: ['#move-left', '#move-right']
        .map(selector => Number(getComputedStyle(document.querySelector(selector)).opacity)),
    }
  })
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.width)
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.height)
  for (const rect of [fit.game, fit.stage, fit.controls]) {
    expect(rect.left).toBeLessThanOrEqual(1)
    expect(rect.top).toBeLessThanOrEqual(1)
    expect(rect.right).toBeGreaterThanOrEqual(fit.width - 1)
    expect(rect.bottom).toBeGreaterThanOrEqual(fit.height - 1)
  }
  expect(fit.bar.top).toBeGreaterThanOrEqual(fit.stage.top)
  expect(fit.bar.bottom).toBeLessThanOrEqual(fit.stage.bottom)
  expect(fit.stage.width / fit.stage.height).toBeGreaterThan(2)
  expect(fit.canvas[0] / fit.canvas[1]).toBeGreaterThan(2)
  expect(fit.directionZone.left).toBeLessThanOrEqual(1)
  expect(fit.directionZone.right).toBeCloseTo(fit.width / 2, 0)
  expect(fit.jumpZone.left).toBeCloseTo(fit.width / 2, 0)
  expect(fit.jumpZone.right).toBeGreaterThanOrEqual(fit.width - 1)
  for (const zone of [fit.directionZone, fit.jumpZone]) {
    expect(zone.top).toBeLessThanOrEqual(1)
    expect(zone.bottom).toBeGreaterThanOrEqual(fit.height - 1)
  }
  for (const control of [fit.left, fit.right]) {
    expect(control.width).toBeGreaterThanOrEqual(64)
    expect(control.height).toBeGreaterThanOrEqual(64)
  }
  expect(fit.jump.width).toBeGreaterThanOrEqual(fit.width / 2 - 1)
  expect(fit.jump.height).toBeGreaterThanOrEqual(fit.height - 1)
  for (const visual of [fit.stick, fit.jumpFeedback]) {
    expect(visual.width).toBeGreaterThanOrEqual(112)
    expect(visual.height).toBeGreaterThanOrEqual(112)
  }
  expect(fit.visualAlpha).toEqual([0, 0])
  expect(fit.visualOpacity).toEqual([0, 0])
  expect(fit.directionOpacity).toEqual([0, 0])
  const visualArea = [fit.stick, fit.jumpFeedback]
    .reduce((area, visual) => area + visual.width * visual.height, 0)
  expect(visualArea).toBeLessThan(fit.width * fit.height * .12)

  const directionTouch = { x: fit.width * .27, y: fit.height * .72 }
  await page.dispatchEvent('#direction-zone', 'pointerdown', {
    pointerId: 51, pointerType: 'touch', isPrimary: true, buttons: 1,
    clientX: directionTouch.x, clientY: directionTouch.y,
  })
  await expect(page.locator('#move-stick')).toHaveCSS('opacity', '0.48')
  const stickCenter = await page.locator('#move-stick').evaluate(element => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  expect(stickCenter.x).toBeCloseTo(directionTouch.x, 0)
  expect(stickCenter.y).toBeCloseTo(directionTouch.y, 0)
  await page.dispatchEvent('#direction-zone', 'pointerup', {
    pointerId: 51, pointerType: 'touch', isPrimary: true, buttons: 0,
    clientX: directionTouch.x, clientY: directionTouch.y,
  })
  await expect(page.locator('#move-stick')).toHaveCSS('opacity', '0')

  const jumpTouch = { x: fit.width * .78, y: fit.height * .62 }
  await page.dispatchEvent('#jump', 'pointerdown', {
    pointerId: 52, pointerType: 'touch', isPrimary: true, buttons: 1,
    clientX: jumpTouch.x, clientY: jumpTouch.y,
  })
  await expect(page.locator('.jump-feedback')).toHaveCSS('opacity', '0.48')
  const jumpCenter = await page.locator('.jump-feedback').evaluate(element => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  expect(jumpCenter.x).toBeCloseTo(jumpTouch.x, 0)
  expect(jumpCenter.y).toBeCloseTo(jumpTouch.y, 0)
  await page.dispatchEvent('#jump', 'pointerup', {
    pointerId: 52, pointerType: 'touch', isPrimary: true, buttons: 0,
    clientX: jumpTouch.x, clientY: jumpTouch.y,
  })
  await expect(page.locator('.jump-feedback')).toHaveCSS('opacity', '0')
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
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '200%'
    }, { once: true })
  })
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
  await page.reload()

  await expect(page.locator('#hidden-lights')).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('font-size', '32px')
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

test('gesture zones preserve large assistive controls and visible keyboard focus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()
  for (const name of ['move left', 'move right', 'jump', 'pause game']) {
    const button = page.getByRole('button', { name })
    const box = await button.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('button', { name: 'move left' }).focus()
  await expect(page.getByRole('button', { name: 'move left' })).toBeFocused()
  await expect(page.locator('#move-left')).toHaveCSS('opacity', '1')
  await page.getByRole('button', { name: 'pause game' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'KEEP GOING' })).toBeVisible()
  await page.getByRole('button', { name: 'START OVER' }).click()
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
})

test('turning upright clears movement and pauses until the player continues', async ({ page }) => {
  await page.setViewportSize({ width: 912, height: 420 })
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  const origin = await page.locator('#direction-zone').evaluate(element => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width * .4, y: box.top + box.height * .7 }
  })
  await page.dispatchEvent('#direction-zone', 'pointerdown', {
    pointerId: 1, pointerType: 'touch', isPrimary: true, buttons: 1,
    clientX: origin.x, clientY: origin.y,
  })
  await page.dispatchEvent('#direction-zone', 'pointermove', {
    pointerId: 1, pointerType: 'touch', isPrimary: true, buttons: 1,
    clientX: origin.x + 42, clientY: origin.y,
  })
  await expect(page.locator('#direction-zone')).toHaveAttribute('data-active', '')
  await expect(page.locator('#move-right')).toHaveAttribute('data-held', '')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeFocused()
  await expect(page.locator('#update')).toHaveAttribute('inert', '')
  await expect(page.locator('#move-right')).not.toHaveAttribute('data-held', '')
  await expect(page.locator('#direction-zone')).not.toHaveAttribute('data-active', '')
  await expect(page.locator('#move-stick')).toHaveCSS('opacity', '0')

  await page.keyboard.press('Escape')
  await expect(page.locator('#rotate-device')).toHaveAttribute('open', '')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'ABOUT' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeFocused()

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'KEEP GOING' })).toBeFocused()
  await page.getByRole('button', { name: 'KEEP GOING' }).click()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeHidden()
})

test('the portrait trail gate has a direct, stopped exit to Home', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'PLAY THE TRAIL' }).click()
  await expect(page.locator('#stage')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Turn your phone sideways' })).toBeVisible()
  await page.getByRole('button', { name: 'EXIT TO HOME' }).click()
  await expect(page.locator('#game')).toBeHidden()
  await expect(page.getByRole('button', { name: 'EXIT TO HOME' })).toBeHidden()

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PLAY THE TRAIL' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeHidden()
})

test('two-times text and phone safe-area insets keep menu and play inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.route('**/app.css*', async route => {
    const response = await route.fetch()
    const css = (await response.text())
      .replaceAll('env(safe-area-inset-top)', '19px')
      .replaceAll('env(safe-area-inset-right)', '47px')
      .replaceAll('env(safe-area-inset-bottom)', '21px')
      .replaceAll('env(safe-area-inset-left)', '47px')
    await route.fulfill({ response, body: `${css}\nhtml { font-size: 200%; }\n` })
  })
  await page.goto('/')

  const menuFit = await page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const nav = document.querySelector('.menu-nav').getBoundingClientRect()
    return {
      width: innerWidth, height: innerHeight,
      rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      paddingTop: parseFloat(body.paddingTop), paddingRight: parseFloat(body.paddingRight),
      paddingBottom: parseFloat(body.paddingBottom), paddingLeft: parseFloat(body.paddingLeft),
      nav: nav.toJSON(),
    }
  })
  expect(menuFit.paddingTop).toBeGreaterThanOrEqual(19)
  expect(menuFit.rootFont).toBeGreaterThanOrEqual(32)
  expect(menuFit.paddingRight).toBeGreaterThanOrEqual(47)
  expect(menuFit.paddingBottom).toBeGreaterThanOrEqual(21)
  expect(menuFit.paddingLeft).toBeGreaterThanOrEqual(47)
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
    const targets = [...document.querySelectorAll('#controls .direction, #game-bar button')]
      .map(button => button.getBoundingClientRect().toJSON())
    return {
      width: innerWidth, height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      paddingTop: parseFloat(body.paddingTop), paddingRight: parseFloat(body.paddingRight),
      paddingBottom: parseFloat(body.paddingBottom),
      paddingLeft: parseFloat(body.paddingLeft),
      bar: bar.toJSON(), stage: stage.toJSON(), controls: controls.toJSON(), targets,
    }
  })
  expect(gameFit.scrollWidth).toBeLessThanOrEqual(gameFit.width)
  expect(gameFit.scrollHeight).toBeLessThanOrEqual(gameFit.height)
  for (const rect of [gameFit.stage, gameFit.controls]) {
    expect(rect.left).toBeLessThanOrEqual(1)
    expect(rect.top).toBeLessThanOrEqual(1)
    expect(rect.right).toBeGreaterThanOrEqual(gameFit.width - 1)
    expect(rect.bottom).toBeGreaterThanOrEqual(gameFit.height - 1)
  }
  expect(gameFit.bar.top).toBeGreaterThanOrEqual(gameFit.paddingTop - 1)
  expect(gameFit.bar.left).toBeGreaterThanOrEqual(gameFit.paddingLeft - 1)
  expect(gameFit.bar.right).toBeLessThanOrEqual(gameFit.width - gameFit.paddingRight + 1)
  expect(gameFit.stage.height).toBeGreaterThanOrEqual(gameFit.height - 1)
  for (const target of gameFit.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44)
    expect(target.height).toBeGreaterThanOrEqual(44)
    expect(target.top).toBeGreaterThanOrEqual(gameFit.paddingTop - 1)
    expect(target.left).toBeGreaterThanOrEqual(gameFit.paddingLeft - 1)
    expect(target.right).toBeLessThanOrEqual(gameFit.width - gameFit.paddingRight + 1)
    expect(target.bottom).toBeLessThanOrEqual(gameFit.height - gameFit.paddingBottom + 1)
  }

  await page.getByRole('button', { name: 'pause game' }).click()
  await expect(page.getByRole('button', { name: 'KEEP GOING' })).toBeFocused()
  const pauseFit = await page.evaluate(() => {
    const overlay = document.querySelector('#game-overlay').getBoundingClientRect()
    const card = document.querySelector('.game-card').getBoundingClientRect()
    const primary = document.querySelector('#resume').getBoundingClientRect()
    return { overlay: overlay.toJSON(), card: card.toJSON(), primary: primary.toJSON() }
  })
  expect(pauseFit.card.top).toBeGreaterThanOrEqual(pauseFit.overlay.top)
  expect(pauseFit.card.bottom).toBeLessThanOrEqual(pauseFit.overlay.bottom)
  expect(pauseFit.card.top).toBeGreaterThanOrEqual(gameFit.paddingTop - 1)
  expect(pauseFit.card.right).toBeLessThanOrEqual(gameFit.width - gameFit.paddingRight + 1)
  expect(pauseFit.card.bottom).toBeLessThanOrEqual(gameFit.height - gameFit.paddingBottom + 1)
  expect(pauseFit.card.left).toBeGreaterThanOrEqual(gameFit.paddingLeft - 1)
  expect(pauseFit.primary.top).toBeGreaterThanOrEqual(pauseFit.card.top)
  expect(pauseFit.primary.bottom).toBeLessThanOrEqual(pauseFit.card.bottom)
  await page.getByRole('button', { name: 'START OVER' }).click()
  await expect(page.getByRole('button', { name: 'pause game' })).toBeFocused()
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

test('the Home hero art covers its card with no repeat seam', async ({ page }) => {
  await page.goto('/')
  const hero = await page.locator('.trail-hero').evaluate(element => {
    const style = getComputedStyle(element)
    return { repeat: style.backgroundRepeat, size: style.backgroundSize, width: element.getBoundingClientRect().width }
  })
  expect(hero.width).toBeGreaterThan(600)
  expect(hero.repeat).toBe('no-repeat, no-repeat')
  expect(hero.size.split(',').at(-1).trim()).toBe('cover')
})

test('every label a kid reads is at least 14px and the daily buttons stack', async ({ page }) => {
  await page.goto('/')
  const sizes = await page.evaluate(() => Object.fromEntries([
    '.nav-item', '#hero-kicker', '#continue-label', '.play-promise', '#daily-kicker', '#daily-copy',
    '#daily-status', '#daily-play', '#friends', '.panel-heading p', '.ethos', '#back', '#seed-count',
    '#game-status', '#guardian-status', '#overlay-kicker', '#overlay-copy', '#rotate-kicker', '.jump-feedback',
    '.trail-seeds', '.region-divider', '.look-status',
  ].map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])))
  for (const [selector, size] of Object.entries(sizes)) expect(size, selector).toBeGreaterThanOrEqual(14)

  await page.getByRole('button', { name: 'MORE' }).click()
  const play = await page.locator('#daily-play').boundingBox()
  const share = await page.locator('#friends').boundingBox()
  expect(share.y).toBeGreaterThanOrEqual(play.y + play.height)
  expect(share.width).toBeCloseTo(play.width, 0)
})

test('a challenge on a locked trail previews as locked instead of starting it', async ({ page }) => {
  const seed = 48151623
  const challenge = dailyChallenge(seed)
  const index = LEVELS.findIndex(level => level.id === challenge.levelId)
  expect(index).toBeGreaterThan(1)
  await page.goto(`/?seed=${seed}`)
  await expect(page.locator('#daily-title')).toHaveText(challenge.title)
  await expect(page.locator('#daily-status')).toHaveText(`LOCKED · CLEAR ${LEVELS[index - 1].name.toUpperCase()} TO OPEN`)
  await expect(page.locator('#daily-play')).toHaveText('TRAIL LOCKED')
  await expect(page.locator('#daily-play')).toBeDisabled()
  await page.evaluate(() => document.querySelector('#daily-play').click())
  await expect(page.locator('#game')).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('jumpit-save-v1'))).toBeNull()

  await page.evaluate(levelId => localStorage.setItem('jumpit-save-v1', JSON.stringify({
    version: 3,
    completed: [],
    unlocked: ['garden-1', levelId],
    bestSeeds: {},
    selectedLevel: 'garden-1',
    theme: 'garden',
    muted: true,
    dailyWins: [],
    hiddenLights: [],
  })), challenge.levelId)
  await page.reload()
  await expect(page.locator('#daily-status')).toHaveText(`◆ ${challenge.goalSeeds} SEEDS + BELL`)
  await expect(page.locator('#daily-play')).toHaveText('PLAY CHALLENGE')
  await expect(page.locator('#daily-play')).toBeEnabled()
  await page.locator('#daily-play').click()
  await expect(page.locator('#level-name')).toHaveText(LEVELS[index].name.toUpperCase())
})
