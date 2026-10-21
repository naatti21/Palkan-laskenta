import { test, expect } from "@playwright/test";

// Synthetic values. Layout-only tests must never ingest personal payslip data.
test("Beta dashboard remains dense with decorative icons at narrow mobile widths", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const { migrateLegacyRecord } = await import("/model.js");
    const { upsertRecord } = await import("/storage.js");
    const source = {
      recordSchemaVersion:1,
      id:"compact-card-synthetic",
      kind:"payslip",
      values:{
        payDate:"2026-10-09",
        payPeriodStart:"2026-09-21",
        payPeriodEnd:"2026-10-04",
        grossPay:3468.68,
        netPay:1988.94,
        ytdTaxableIncome:77350.63,
        taxLimit:40000,
        taxCardAccumulatedIncome:21546.39
      },
      payLines:[],
      fingerprints:["synthetic-card-layout-only"],
      fieldMeta:{}, corrections:{}, notices:[],
      parser:{ version:"ui-test", confidence:1,documentType:"payslip",sourceProfile:"synthetic"}
    };
    await upsertRecord(migrateLegacyRecord(source));
  });
  for (const width of [320, 360, 412]) {
    await page.setViewportSize({width,height:790});
    await page.reload();
    await expect(page.locator("#dashboard .metric")).toHaveCount(4);
    await expect(page.locator("#dashboard")).toContainText("1 988");
    const state = await page.locator(".beta-primary-metrics .metric").evaluateAll(cards =>
      cards.map(el => {
        const rect = el.getBoundingClientRect();
        const css = getComputedStyle(el);
        const icon = getComputedStyle(el,"::before");
        return {
          height:rect.height,
          width:rect.width,
          columns:css.gridTemplateColumns.split(" ").length,
          iconImage:icon.backgroundImage,
          pseudoContent:icon.content,
          hasOverflow:el.scrollWidth>el.clientWidth+1
        };
      })
    );
    expect(state).toHaveLength(4);
    for (const card of state) {
      expect(card.height).toBeLessThan(115);
      expect(card.height).toBeGreaterThan(70);
      expect(card.columns).toBe(2);
      expect(card.iconImage).toContain("data:image/svg+xml");
      expect(card.pseudoContent).toBe('""');
      expect(card.hasOverflow).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth+1)).toBe(false);
    await expect(page.locator("#pdfInput")).toBeDisabled();
    await expect(page.locator("#history")).toBeHidden();
  }
});

test("Historical payslip expansion and tax-card information remain available", async ({page}) => {
  await page.goto("/index.html");
  await page.getByRole("button",{name:"Historia"}).click();
  await expect(page.locator("#history")).toBeVisible();
  await page.getByRole("button",{name:"Seuranta"}).click();
  await expect(page.locator("#taxCardProgress")).toBeVisible();
  await expect(page.locator("#taxCardEstimate")).toHaveCount(1);
  await expect(page.locator("#dashboardMore")).toHaveCount(1);
});
