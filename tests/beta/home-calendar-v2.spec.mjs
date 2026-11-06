import { test, expect } from "@playwright/test";

test("Beta home shows latest realized payday and actual year totals, no month selector or personal year plan", async ({page}) => {
  await page.setViewportSize({width:360,height:800});
  await page.goto("/");
  await page.evaluate(async () => {
    const storage=await import("/storage.js");
    const a=await storage.createIncomeSource("Työ");
    const b=await storage.createIncomeSource("Lisätyö");
    for(const [id,date,gross,net,source,kind] of [
      ["sept","2025-09-30",1200,900,a.id,"payslip"],
      ["oct-main","2025-10-30",3100,2500,a.id,"payslip"],
      ["oct-side","2025-10-30",800,600,b.id,"payslip"],
      ["forecast","2025-11-30",10000,9000,a.id,"forecast"],
      ["future","2099-12-10",2000,1500,a.id,"payslip"]
    ]) {
      await storage.upsertRecord({id,recordSchemaVersion:3,kind,incomeSourceId:source,
        values:{payDate:date,payPeriodStart:date,payPeriodEnd:date,grossPay:gross,netPay:net}});
    }
  });
  await page.reload();
  await expect(page.locator(".beta-home-amount")).toContainText("3 100");
  await expect(page.locator(".beta-home-caption")).toContainText("30.10.2025");
  await expect(page.getByRole("combobox",{name:"Seurannan maksukuukausi"})).toHaveCount(0);
  await expect(page.locator("#yearProgressPanel")).toHaveCount(0);
  for(let n=0;n<5 && await page.locator("#dashboardYear").inputValue()!=="2025";n++)
    await page.getByRole("button",{name:"Edellinen vuosi"}).click();
  await expect(page.locator("#dashboardYear")).toHaveValue("2025");
  await expect(page.locator(".beta-year-cell").first()).toContainText("4 000");
  await expect(page.locator(".beta-year-cell").last()).toContainText("5 100");
  await page.getByRole("button",{name:"Näytä palkkaerittely"}).click();
  await expect(page.locator('[data-view="history"]')).toBeVisible();
  await expect(page.locator("#ledgerCalendar")).toBeVisible();
  await expect(page.locator(".ledger-month-stats")).toContainText("3 100");
  await expect(page.locator("#history .history-row:visible")).toHaveCount(2);
  await page.getByRole("button",{name:"Lista"}).click();
  await expect(page.locator("#history .history-row:visible")).toHaveCount(4);
});

test("Future confirmed pay date appears as an estimate-free calendar marker, not realized cash", async ({page}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { upsertRecord }=await import("/storage.js");
    await upsertRecord({id:"future-2099",recordSchemaVersion:3,kind:"payslip",
      values:{payDate:"2099-05-23",payPeriodStart:"2099-05-01",payPeriodEnd:"2099-05-15",grossPay:3200,netPay:2100}});
  });
  await page.reload();
  await expect(page.locator(".beta-home-amount")).toHaveText("–");
  await page.getByRole("button",{name:"Kalenteri",exact:true}).click();
  await expect(page.locator("#ledgerCalendar")).toContainText("vahvistettua tulevaa maksua");
  await expect(page.locator(".ledger-days button.is-future")).toHaveCount(1);
  await expect(page.locator(".ledger-month-stats")).not.toContainText("2 100");
  await page.locator(".ledger-days button.is-future").click();
  await expect(page.locator("#history .history-row:visible")).toHaveCount(1);
});
