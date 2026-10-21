import { test, expect } from "@playwright/test";

// Synthetic payroll information only. Checks presentation vs. data-provenance.
test("Beta shows independent values once and keeps tax details available on demand", async ({ page }) => {
  await page.goto("/index.html");
  const backup = await page.evaluate(async () => {
    const model = await import("/model.js");
    const row = model.migrateLegacyRecord({
      recordSchemaVersion:1,id:"info-audit-synthetic",kind:"payslip",
      values:{
        payDate:"2026-10-23",payPeriodStart:"2026-10-05",payPeriodEnd:"2026-10-18",
        netPay:1988.94,grossPay:3468.68,ytdTaxableIncome:77350.63,
        taxLimit:40000,taxCardAccumulatedIncome:21546.39,overtimeHours:20.95
      },
      payLines:[],fingerprints:["info-audit-synthetic"],fieldMeta:{},corrections:{},notices:[],
      parser:{version:"qa",confidence:1,documentType:"payslip",sourceProfile:"synthetic"}
    });
    return JSON.stringify(model.makeBackup([row]));
  });
  await page.getByRole("button",{name:"Data"}).click();
  await page.locator("#backupInput").setInputFiles({
    name:"synthetic-info-audit.json",mimeType:"application/json",buffer:Buffer.from(backup)
  });
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await page.getByRole("button",{name:"Seuranta"}).click();

  await expect(page.locator("#dashboard .metric")).toHaveCount(2);
  await expect(page.locator("#dashboard")).toContainText("Viimeisin nettopalkka");
  await expect(page.locator("#dashboard")).toContainText("Veronalainen kertymä");
  await expect(page.locator("#dashboard")).toContainText("Maksupäivä 23.10.2026");
  await expect(page.locator("#dashboard")).not.toContainText("Kortin marginaali");
  await expect(page.locator("#dashboard")).not.toContainText("Brutto");
  await expect(page.locator("#taxCardRemaining")).toContainText("18 453,61");
  await expect(page.locator("#taxCardPercent")).toHaveText("54 %");
  await expect(page.locator("#dashboardNote")).toBeHidden();

  const taxDetails = page.locator(".beta-taxcard-provenance");
  await expect(taxDetails).not.toHaveAttribute("open","");
  await taxDetails.locator("summary").click();
  await expect(taxDetails).toHaveAttribute("open","");
  await expect(page.locator("#taxCardContext")).toContainText("OmaVerosta");

  await expect(page.locator("#dashboardDetails")).toBeHidden();
  await page.locator("#dashboardMore > summary").click();
  await expect(page.locator("#dashboardDetails .metric")).toHaveCount(2);
  await expect(page.locator("#dashboardDetails")).toContainText("Viimeisin bruttopalkka");
  await expect(page.locator("#dashboardDetails")).toContainText("Ylityöt viime jaksolla");
  await expect(page.locator("#dashboardDetails")).not.toContainText("Kortin kertymä");

  const badges = await page.locator("#dashboard .metric").evaluateAll(rows =>
    rows.map(el=>({
      before:getComputedStyle(el,"::before").content,
      icon:getComputedStyle(el,"::before").backgroundImage
    }))
  );
  for(const badge of badges){expect(badge.before).toBe("none");expect(badge.icon).toBe("none");}

  await page.getByRole("button",{name:"Analyysi"}).click();
  await expect(page.locator("#analysisMetrics .metric")).toHaveCount(2);
  await expect(page.locator("#analysisMetrics")).toContainText("Tallennettujen netot yhteensä");
  await expect(page.locator("#analysisMetrics")).toContainText("Kirjatut ylityötunnit");
  await expect(page.locator("#analysisMetrics")).not.toContainText("Tallennettujen laskelmien brutto");
  await expect(page.locator("#analysisMetrics")).not.toContainText("Viimeisimmän laskelman YTD");
  await expect(page.locator("#monthlyChart .chart-bar-gross")).toHaveCount(1);
  await expect(page.locator("#pdfInput")).toBeDisabled();
});

test("Tax-card warnings are never hidden as routine green status", async ({page}) => {
  await page.goto("/index.html");
  await expect(page.locator("#dashboardNote")).toBeVisible();
  await expect(page.locator("#taxCardProgress")).toBeVisible();
  await expect(page.locator(".beta-taxcard-provenance")).toHaveCount(1);
});
