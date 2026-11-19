import { defineConfig } from 'playwright/test'
import { existsSync } from 'node:fs'
import { loadE2EEnv } from './e2e/support/env'

const env = loadE2EEnv()
const executablePath = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined)

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/e2e/report', open: 'never' }],
    ['json', { outputFile: 'test-results/e2e/results.json' }],
  ],
  outputDir: 'test-results/e2e/artifacts',
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL: env.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  webServer: process.env.E2E_EXTERNAL_SERVER === '1' ? undefined : {
    command: 'npm run build:e2e && npm run start:e2e -- --hostname 127.0.0.1 --port 4179',
    url: env.baseUrl,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_URL: env.supabaseUrl,
      ...(env.serviceRoleKey ? { SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey } : {}),
      ...(env.aiApiKey ? { AI_API_KEY: env.aiApiKey } : {}),
      ...(env.aiProvider ? { AI_PROVIDER: env.aiProvider } : {}),
      ...(env.aiModel ? { AI_MODEL: env.aiModel } : {}),
      ...(env.firecrawlApiKey ? { FIRECRAWL_API_KEY: env.firecrawlApiKey } : {}),
    },
  },
})
