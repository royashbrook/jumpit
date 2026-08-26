import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4320',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-air', use: { browserName: 'chromium', viewport: { width: 420, height: 912 }, hasTouch: true, isMobile: true } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: 'node tools/serve.mjs . 4320',
    url: 'http://127.0.0.1:4320',
    reuseExistingServer: false,
  },
})
