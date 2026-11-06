import { defineConfig } from '@playwright/test'

// End-to-end tests: launch the built Electron app (npm run build first) against a fake GitHub API.
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // One Electron app at a time: they share the machine's GPU and the fake server is per test anyway.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  outputDir: 'test-results'
})
