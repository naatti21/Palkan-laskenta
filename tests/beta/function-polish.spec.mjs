import { test, expect } from "@playwright/test";

test("latest realized payment opens matching day in existing calendar while keeping future cash separate", async({page}) => {
  await page.setViewportSize({width:360,height:800});
  await page.goto("/");
  await page.evaluate(async()=>{
    const db=await import("/storage.js");
    for (const [id,date,gross,net] of [
      ["oct-first","2026-10-09",2100,1500],
      ["oct-last","2026-10-23",3100,2200],
      ["future","2099-05-23",5000,4000]
    ]) await db.upsertRecord({id,kind:"payslip",recordSchemaVersion:3,
      values:{payDate:date,payPeriodStart:date,payPeriodEnd:date,
        grossPay:gross,netPay:net}});
  });
  await page.reload();
  await expect(page.locator(".compact-amount")).toContainText("2 200");
  await expect(page.locator(".compact-lead").first()).toContainText("23.10.2026");
  await expect(page.getByRole("combobox",{name:"Seurannan maksukuukausi"})).toHaveCount(0);
  await expect(page.locator("#yearProgressPanel")).toHaveCount(0);

  await page.locator(".compact-lead button").click();
  await expect(page.locator('[data-view="history"]')).toBeVisible();
  await expect(page.locator("#historyYear")).toHaveValue("2026");
  await expect(page.locator("#ledgerCalendar")).toBeVisible();
  await expect(page.locator("#ledgerCalendar")).toContainText(/3\s700/);
  await expect(page.locator("#ledgerCalendar")).toContainText(/5\s200/);
  await expect(page.locator("#history .history-row:visible")).toHaveCount(1);
  await expect(page.locator("#history .history-row:visible")).toContainText("23.10.2026");
});

test("annual totals omit future records and missing sums are not silently estimated", async({page}) => {
  await page.goto("/");
  await page.evaluate(async()=>{
    const db=await import("/storage.js");
    await db.upsertRecord({id:"past",kind:"payslip",recordSchemaVersion:3,
      values:{payDate:"2026-02-19",payPeriodStart:"2026-02-01",payPeriodEnd:"2026-02-14",
        grossPay:3000,netPay:2200}});
    await db.upsertRecord({id:"future",kind:"payslip",recordSchemaVersion:3,
      values:{payDate:"2099-11-19",payPeriodStart:"2099-11-01",payPeriodEnd:"2099-11-14",
        grossPay:9000,netPay:7200}});
  });
  await page.reload();
  await page.locator("#dashboardYear").selectOption("2026");
  await expect(page.locator(".compact-lead").nth(1)).toContainText("Netto 2 200");
  await expect(page.locator(".compact-lead").nth(1)).toContainText("Brutto 3 000");
  await expect(page.locator(".compact-lead").nth(1)).not.toContainText("9 000");
  await expect(page.locator(".compact-lead").nth(1)).not.toContainText("7 200");
});
