import { test, expect } from "@playwright/test";

test("calendar groups realized source payments by payday and remembers the view", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const db = await import("/storage.js");
    for (const [name, net] of [["Päätyö", 2500], ["Keikkatyö", 600]]) {
      const source = await db.createIncomeSource(name);
      await db.upsertRecord({id: source.id, recordSchemaVersion: 3, incomeSourceId: source.id,
        values: {payDate: "2025-10-30", payPeriodStart: "2025-09-01", payPeriodEnd: "2025-09-30",
          grossPay: net + 400, netPay: net}});
    }
  });
  await page.reload();
  await page.getByRole("button", {name: "Kalenteri", exact:true}).click();
  await expect(page.locator("#historyYear")).toHaveValue("2025");
  await page.getByRole("button", {name: "Kuukausi", exact:true}).click();
  await expect(page.locator("#ledgerCalendar")).toContainText(/3\s100,00/);
  await expect(page.locator("#history .history-row:visible")).toHaveCount(2);
  await page.getByRole("button", {name:"Edellinen kuukausi"}).click();
  await expect(page.locator("#history .history-row:visible")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", {name: "Kalenteri", exact:true}).click();
  await expect(page.getByRole("button", {name:"Kuukausi",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button", {name:"Lista",exact:true}).click();
  await expect(page.locator("#historyYear")).toHaveValue("2025");
  await expect(page.locator("#history .history-row:visible")).toHaveCount(2);
});
