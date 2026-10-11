import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/staging', timeout: 45_000, forbidOnly: !!process.env.CI,
  retries: 0, workers: 1, reporter: [['line'], ['json', { outputFile: 'test-results/staging.json' }]],
  use: { headless: true, serviceWorkers: 'allow', viewport: { width: 412, height: 915 },
    timezoneId: 'Europe/Helsinki', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'python3 -m http.server 4174 --bind 127.0.0.1', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
    { command: 'python3 -m http.server 4175 --bind 127.0.0.1 --directory _staging', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
    { command: 'python3 -m http.server 4176 --bind 127.0.0.1 --directory _staging', url: 'http://127.0.0.1:4176', reuseExistingServer: false }
  ]
});
