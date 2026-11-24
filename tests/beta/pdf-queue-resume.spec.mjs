import { test, expect } from "@playwright/test";
import { makeTextPdf } from "../staging/pdf-helper.mjs";

// Synthetic payroll values only. Real payslips are never committed or uploaded.
test("Beta import queue automatically resumes after an explicit conflict decision", async ({ page }) => {
  await page.setViewportSize({width:360,height:860});
  await page.goto("/index.html");
  await expect(page.locator("#betaImportOpen")).toBeVisible();

  const backup = await page.evaluate(async () => {
    const { makeBackup, migrateLegacyRecord } = await import("/model.js");
    const existing = migrateLegacyRecord({
      id:"qa-other-year", recordSchemaVersion:3, incomeSourceId:"paatyot",
      values:{
        payDate:"2025-12-29", grossPay:3290.15, netPay:2450.22,
        payPeriodStart:"2025-12-01",payPeriodEnd:"2025-12-15"
      }
    });
    return JSON.stringify(makeBackup([existing], {
      incomeSources:[{id:"paatyot",name:"Päätyö"}]
    }));
  });
  await page.getByRole("button",{name:"Asetukset"}).click();
  await page.locator("#backupInput").setInputFiles({
    name:"synthetic-batch-source.json",mimeType:"application/json",buffer:Buffer.from(backup)
  });
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await page.getByRole("button",{name:"Seuranta"}).click();
  await page.locator("#betaImportOpen").click();
  await page.locator("#betaBatchSource").selectOption("paatyot");

  const pdf = (date,period,net,ytd) => makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi " + period,
    "Maksupäivä " + date,
    "Maksetaan " + net,
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul 3 000,00",
    "Ennakonpidätys -800,00",
    "Maksetaan " + net,
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul " + ytd,
    "Ennakonpidätys -6 400,00"
  ]);
  await page.locator("#betaBatchInput").setInputFiles([
    {name:"01-ensimmainen.pdf",mimeType:"application/pdf",buffer:pdf("28.9.2026","1.9.2026 - 15.9.2026","1 900,00","24 000,00")},
    {name:"02-ristiriita.pdf",mimeType:"application/pdf",buffer:pdf("28.9.2026","1.9.2026 - 15.9.2026","1 850,00","23 950,00")},
    {name:"03-viimeinen.pdf",mimeType:"application/pdf",buffer:pdf("28.10.2026","1.10.2026 - 15.10.2026","2 050,00","27 000,00")}
  ]);
  // One bulk confirmation at the start; no repeat confirmation after decision.
  let dialogs=0;
  page.on("dialog",async dialog => { dialogs++; await dialog.accept(); });
  await page.locator("#betaBatchNext").click();
  await expect(page.locator("#conflictSection")).toBeVisible();
  await expect(page.locator("#betaBatchFiles li").nth(0)).toContainText("Tallennettu");
  await expect(page.locator("#betaBatchFiles li").nth(1)).toContainText("Ristiriita");
  await expect(page.locator("#betaBatchFiles li").nth(2)).toContainText("Odottaa");

  // The existing cancel/skip decision releases the queue. No new button.
  await expect(page.locator("#betaBatchContinue")).toHaveCount(0);
  await page.locator("#cancelConflictButton").click();
  await expect(page.locator("#betaBatchFiles li").nth(1)).toContainText("Ohitettu");
  await expect(page.locator("#betaBatchFiles li").nth(2)).toContainText("Tallennettu");
  await expect(page.locator("#betaBatchStatus")).toContainText("tallennettu 2");
  expect(dialogs).toBe(1);
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(3);
  const imported = records.filter(row => row.values.payDate === "2026-09-28" || row.values.payDate === "2026-10-28");
  expect(imported).toHaveLength(2);
  expect(imported.map(row => row.values.payDate).sort()).toEqual(["2026-09-28","2026-10-28"]);
});
