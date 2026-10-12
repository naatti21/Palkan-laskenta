import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/beta',
  timeout: 45_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['line'], ['json', { outputFile: 'test-results/beta.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    headless: true,
    serviceWorkers: 'allow',
    viewport: { width: 412, height: 915 },
    timezoneId: 'Europe/Helsinki',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'python3 -m http.server 4177 --bind 127.0.0.1 --directory _beta',
      url: 'http://127.0.0.1:4177',
      reuseExistingServer: false
    },
    {
      command: 'python3 -m http.server 4178 --bind 127.0.0.1 --directory _beta',
      url: 'http://127.0.0.1:4178',
      reuseExistingServer: false
    }
  ]
});
