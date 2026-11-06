import { test, expect } from "@playwright/test";

async function seed(page) {
  return page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    const payer = await storage.createIncomeSource("Synteettinen työnantaja");
    const rows = [
      { id:"spring-first", payDate:"2026-05-22", gross:1750, net:1150, ytd:14500 },
      { id:"spring-later", payDate:"2026-06-05", gross:2800, net:1800, ytd:17300 }
    ].map(r => model.migrateLegacyRecord({
      id:r.id, recordSchemaVersion:3, incomeSourceId:payer.id,
      values:{
        payDate:r.payDate, payPeriodStart:"2026-05-01",
        payPeriodEnd:"2026-05-14", grossPay:r.gross,
        netPay:r.net, ytdTaxableIncome:r.ytd,
        taxCardAccumulatedIncome:r.ytd, taxLimit:55000
      }
    }));
    await storage.mergeManyRecords(rows);
    return payer.id;
  });
}

async function status(page) {
  return page.evaluate(async () => {
    const rows = await (await import("/storage.js")).getAllRecords();
    const projection = (await import("/model.js")).projectPayroll(rows);
    return {active:projection.active.length, unresolved:projection.unresolved.length,
      net:projection.active.reduce((s,r)=>s+r.values.netPay,0)};
  });
}

for (const width of [320,390]) {
  test("pay-cycle transition UX gives evidence but never automatically includes overlapping pays at "+width+"px", async ({page}) => {
    await page.setViewportSize({width,height:850});
    await page.goto("/index.html");
    await seed(page);
    await page.reload();
    expect(await status(page)).toEqual({active:0, unresolved:2, net:0});
    await page.getByRole("button",{name:"Historia",exact:true}).click();
    await page.getByRole("button",{name:"Ratkaise palkkatapahtuma"}).first().click();
    await expect(page.locator("#conflictSection")).toBeVisible();
    await expect(page.locator(".paycycle-payment")).toHaveCount(2);
    await expect(page.locator(".paycycle-evidence")).toContainText("Kertymät viittaavat kahteen erilliseen palkkaan");
    await expect(page.locator(".paycycle-evidence")).toContainText(/2\s*800,00/);
    await expect(page.locator(".paycycle-action-guide")).toContainText("tilitapahtumina");
    await expect(page.locator(".paycycle-technical-details")).not.toHaveAttribute("open","");
    await expect(page.locator("#keepBothConflictButton")).toContainText("Molemmat maksettu");
    expect(await status(page)).toEqual({active:0, unresolved:2, net:0});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator("#keepBothConflictButton").click();
    await expect(page.locator("#resultTitle")).toContainText("Molemmat");
    expect(await status(page)).toEqual({active:2, unresolved:0, net:2950});
  });
}

test("non-matching YTD shows a neutral warning without suggesting a separate payment", async ({page})=>{
  await page.goto("/index.html");
  await seed(page);
  await page.evaluate(async()=>{
    const storage=await import("/storage.js");
    const model=await import("/model.js");
    const rows=await storage.getAllRecords();
    const newRows=rows.map(row=>row.id==="spring-later"
      ? model.migrateLegacyRecord({...row,values:{...row.values,ytdTaxableIncome:17600,
        taxCardAccumulatedIncome:17600}}) : row);
    await storage.clearAllRecords();
    await storage.mergeManyRecords(newRows);
  });
  await page.reload();
  await page.getByRole("button",{name:"Historia",exact:true}).click();
  await page.getByRole("button",{name:"Ratkaise palkkatapahtuma"}).first().click();
  await expect(page.locator(".paycycle-evidence")).not.toContainText("Kertymät viittaavat kahteen");
  await expect(page.locator(".paycycle-evidence")).toContainText("Maksupäivät eroavat");
  expect((await status(page)).unresolved).toBe(2);
});
