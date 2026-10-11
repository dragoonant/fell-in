import { defineConfig, devices } from '@playwright/test'

// PW_PORT lets a run avoid a port another project already holds.
const PORT = Number(process.env.PW_PORT ?? 4191)
// Production base path (see vite.config.ts): the preview server serves the build under this sub-path, like Pages.
const BASE_URL = `http://localhost:${PORT}/fell-in/`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 4,
  timeout: 90_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
