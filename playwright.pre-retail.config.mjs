import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pre-retail",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4190",
    channel: "chromium",
    serviceWorkers: "allow",
    timezoneId: "Europe/Helsinki",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "python3 tests/pre-retail/pages-server.py",
    url: "http://127.0.0.1:4190",
    reuseExistingServer: false
  }
});
