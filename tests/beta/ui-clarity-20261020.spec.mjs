import { test, expect } from "@playwright/test";

// Synthetic data only. Keep real payroll documents and identifying details out of GitHub.
test("Beta dashboard remains compact and import stays gated", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#pdfInput")).toBeDisabled();
  await expect(page.locator(".beta-compact-dashboard")).toBeVisible();
  await expect(page.locator(".beta-primary-metrics")).toHaveCount(1);
  await expect(page.locator("#dashboardNote")).toContainText("ei ole vielä palkkalaskelmia");
  await expect(page.locator(".beta-taxcard-progress")).toBeVisible();
  await expect(page.locator('[data-view="planning"]')).toHaveCount(1);
  await expect(page.locator(".planner-fold")).toHaveCount(0);
  await expect(page.locator(".analysis-collection")).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});

test("History opens a single stored payslip and nested source lines without HTML injection", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const { makeRecordFromParsed } = await import("/model.js");
    const { clearAllRecords, upsertRecord } = await import("/storage.js");
    await clearAllRecords();
    const source = {
      payDate: "2026-10-23",
      payPeriodStart: "2026-10-01",
      payPeriodEnd: "2026-10-14",
      grossPay: 2950,
      netPay: 1988.94,
      withholdingPeriod: -610.62,
      ytdTaxableIncome: 55300,
      taxLimit: 40000,
      taxCardAccumulatedIncome: 21546.39,
      overtimeHours: 4.5
    };
    const fields = Object.fromEntries(Object.entries(source).map(([key, value]) =>
      [key, { value, confidence: 1, source: "synthetic-ui-test" }]
    ));
    const record = makeRecordFromParsed({
      fields,
      documentType: "payslip",
      parserVersion: "ui-test",
      payLines: [{ code: "123", label: "<img src=x onerror=alert(1)>", quantity: 4, unitType: "h", amount: 100 }]
    }, "synthetic-ui-only");
    await upsertRecord(record);
  });
  await page.reload();
  await page.locator('[data-view-target="history"]').click();
  const item = page.locator(".payslip-item");
  await expect(item).toHaveCount(1);
  await expect(item).not.toHaveAttribute("open", "");
  await item.locator("summary.payslip-summary").click();
  await expect(item).toHaveAttribute("open", "");
  await expect(item.locator(".payslip-fields")).toContainText("Bruttopalkka");
  await expect(item.locator(".payslip-fields")).toContainText("1 988");
  await item.locator(".payslip-lines > summary").click();
  await expect(item.locator(".payslip-line-list")).toContainText("<img src=x onerror=alert(1)>");
  await expect(item.locator("img")).toHaveCount(0);
  await item.locator("summary.payslip-summary").click();
  await expect(item).not.toHaveAttribute("open", "");
});

test("Calculator is on its own tab and Analysis remains independently expandable", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-view-target="analysis"]').click();
  await expect(page.locator("#plannerFrame")).toBeHidden();
  await expect(page.locator(".analysis-collection")).toHaveCount(2);
  await page.locator(".analysis-collection").first().locator("summary").first().click();
  await expect(page.locator(".analysis-collection").first()).toHaveAttribute("open", "");
  await page.locator('[data-view-target="planning"]').click();
  await expect(page.getByRole("heading",{name:"Vuosisuunnittelu"})).toBeVisible();
  await expect(page.locator("#plannerFrame")).toBeVisible();
});
