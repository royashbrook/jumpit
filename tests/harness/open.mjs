import { expect } from 'playwright/test'

export async function openHarness(page, { game = 'real', audio = 'real', seed } = {}) {
  const url = new URL(process.env.JUMPIT_HARNESS_URL || 'http://127.0.0.1:4392/')
  url.searchParams.set('game', game)
  url.searchParams.set('audio', audio)
  if (seed !== undefined) url.searchParams.set('seed', seed)
  const response = await page.goto(url.href)
  expect(response?.status()).toBe(200)
  // A missing or unused fixture must fail, not silently exercise the real game.
  await expect(page.locator('html')).toHaveAttribute('data-harness-game', game)
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio', audio)
  await expect(page.locator('html')).toHaveAttribute('data-harness-game-calls', '1')
  await expect(page.locator('html')).toHaveAttribute('data-harness-audio-calls', '1')
}
