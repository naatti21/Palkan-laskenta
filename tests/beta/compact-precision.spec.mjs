import {test,expect} from "@playwright/test";

test("month totals use realized payments only and survive long source names on narrow screens",async({page})=>{
  await page.setViewportSize({width:320,height:800});
  await page.goto("/");
  await page.evaluate(async()=>{
    const db=await import("/storage.js");
    const main=await db.createIncomeSource("Pitkä tulolähteen nimi ".repeat(3));
    const gig=await db.createIncomeSource("Keikkatyö");
    for(const [id,date,net,source] of [["a","2025-10-30",12400,main],["b","2025-10-30",-120,gig],["c","2025-09-30",850,main]]) {
      await db.upsertRecord({id,recordSchemaVersion:3,incomeSourceId:source.id,values:{payDate:date,payPeriodStart:date,payPeriodEnd:date,grossPay:net,netPay:net}});
    }
  });
  await page.reload();
  await page.locator("#dashboardYear").selectOption("2025");
  await expect(page.locator(".compact-amount")).toContainText(/12\s280/);
  await page.getByRole("combobox",{name:"Seurannan maksukuukausi"}).selectOption("2025-09");
  await expect(page.locator(".compact-amount")).toContainText("850");
  await page.addStyleTag({content:"html{font-size:125%}"});
  for(const name of ["Seuranta","Historia","Analyysi","Laskuri","Data"]){
    await page.getByRole("button",{name,exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
});
