import { test, expect } from "@playwright/test";

test("beta branding, exact origin and offline analytics shell", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#beta-banner")).toContainText("BETA");
  await expect(page).toHaveTitle("Palkka BETA");
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.getByRole("heading", { name: "Ansiot ja työaika" })).toBeVisible();
  const info = await page.evaluate(async () => (await (await fetch("./build-info.json")).json()));
  expect(info.environment).toBe("beta");
  expect(info.origin).toBe("http://127.0.0.1:4177");
  await expect.poll(async () => page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const cachesHere = await caches.keys();
    return cachesHere.some(key => key.startsWith("palkka-beta-v"));
  }), { timeout: 15000 }).toBeTruthy();
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith("palkka-beta-v")));
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  expect(cached).toContain("/analytics.js");
  expect(cached).toContain("/beta-entry.mjs");
});

test("another origin cannot start a beta application from the same files", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/index.html");
  await expect(page.locator("#beta-banner")).toContainText("BETA ESTETTY");
  await expect(page.locator("main")).toHaveCount(0);
  const worker = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(x => x.length));
  expect(worker).toBe(0);
});

test("synthetic production-format JSON backup restores locally into beta analysis, survives reload", async ({ page }) => {
  await page.goto("/index.html");
  const content = await page.evaluate(async () => {
    const model = await import("/model.js");
    const a = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "beta-synthetic-2026-10",
      kind: "payslip",
      values: {
        payDate: "2026-10-09",
        payPeriodStart: "2026-09-21",
        payPeriodEnd: "2026-10-04",
        grossPay: 3212.79,
        netPay: 1831.61,
        overtimeHours: null,
        ytdTaxableIncome: 73881.95
      },
      payLines: [], fingerprints: ["synthetic-beta-01"],
      fieldMeta: {}, corrections: {}, notices: [],
      parser: { version: "qa", confidence: 1, documentType: "payslip", sourceProfile: "qa" }
    });
    return JSON.stringify(model.makeBackup([a]));
  });
  await page.getByRole("button", { name: "Data" }).click();
  await page.locator("#backupInput").setInputFiles({
    name: "synthetic-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(content, "utf8")
  });
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#analysisNote")).toContainText("1 palkkalaskelmaa");
  await expect(page.locator("#analysisMetrics")).toContainText("3 212,79");
  await expect(page.locator("#analysisMetrics")).toContainText("1 831,61");
  await expect(page.locator("#analysisMetrics")).toContainText("Ei tietoa");
  await page.reload();
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#analysisMetrics")).toContainText("1 831,61");
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(1);
  expect(records[0].values.grossPay).toBe(3212.79);
  expect(records[0].values.overtimeHours).toBe(null);
});

test("beta source does not overwrite QA staging, main or browser origin", async ({ page }) => {
  await page.goto("/index.html");
  const registration = await page.evaluate(async () => {
    const item = await navigator.serviceWorker.ready;
    return { scope: item.scope, script: item.active?.scriptURL || "" };
  });
  expect(registration.scope).toBe("http://127.0.0.1:4177/");
  expect(registration.script).toBe("http://127.0.0.1:4177/sw.js");
  const cachesHere = await page.evaluate(() => caches.keys());
  for (const item of cachesHere) {
    expect(item).not.toContain("palkka-staging-v");
    expect(item).not.toBe("palkka-pwa-v16");
  }
});
