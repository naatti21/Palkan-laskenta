import { test, expect } from "@playwright/test";

test("@smoke Analyysi opens on a narrow screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.getByRole("heading", { name: "Ansiot ja työaika" })).toBeVisible();
  await expect(page.locator("#analysisNote")).toContainText("Ei tallennettuja palkkalaskelmia");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("real local storage -> analysis UI -> reload preserves salary and missing overtime semantics", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    const base = (id, date, gross, net, hours, ytd) => model.migrateLegacyRecord({
      recordSchemaVersion: 1, id, kind: "payslip",
      values: {
        payDate: date, payPeriodStart: date, payPeriodEnd: date,
        grossPay: gross, netPay: net, overtimeHours: hours, ytdTaxableIncome: ytd
      }, fingerprints: [id], payLines: [], fieldMeta: {}, corrections: {}, notices: [],
      parser: { version: "qa", confidence: 1, documentType: "payslip", sourceProfile: "qa" }
    });
    await storage.upsertRecord(base("qa-a", "2026-09-25", 2100.11, 1500.12, 6.5, 30000.10));
    await storage.upsertRecord(base("qa-b", "2026-10-09", 3212.79, 1831.61, null, 33212.89));
  });
  await page.reload();
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#analysisNote")).toContainText("2 palkkalaskelmaa");
  await expect(page.locator("#analysisMetrics")).toContainText("3 331,73");
  await expect(page.locator("#analysisMetrics")).toContainText("6,5 h (osittainen)");
  await expect(page.locator("#analysisMetrics")).toContainText("Puuttuva tieto ei ole nolla");
  await expect(page.locator(".chart-row")).toHaveCount(2);
  const before = await page.locator("#monthlyChart").innerText();
  await page.reload();
  await page.getByRole("button", { name: "Analyysi" }).click();
  expect(await page.locator("#monthlyChart").innerText()).toBe(before);
});
