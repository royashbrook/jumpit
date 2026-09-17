import { defineConfig } from 'playwright/test'

const releaseRoot = process.env.JUMPIT_ROOT || 'build'
const port = Number(process.env.JUMPIT_PORT || 4391)
const harnessPort = Number(process.env.JUMPIT_HARNESS_PORT || 4392)
process.env.JUMPIT_HARNESS_URL = `http://127.0.0.1:${harnessPort}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  // A cold Linux WebKit process can spend more than 20 seconds creating its first
  // page. Assertions keep their five-second gate; this only gives fixture setup room.
  timeout: process.env.CI ? 45_000 : 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-air', use: { browserName: 'chromium', viewport: { width: 912, height: 420 }, hasTouch: true, isMobile: true } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ],
  webServer: [{
    command: `node tools/serve.mjs ${releaseRoot} ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  }, {
    command: `node tools/serve.mjs build-harness ${harnessPort}`,
    url: `http://127.0.0.1:${harnessPort}`,
    reuseExistingServer: false,
  }],
})
