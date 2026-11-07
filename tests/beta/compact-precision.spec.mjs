import {test,expect} from "@playwright/test";

test("home latest payment and annual sums use realized payroll only and fit narrow screens",async({page})=>{
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
  await expect(page.locator(".compact-lead").first()).toContainText("30.10.2025");
  await expect(page.locator(".compact-lead").nth(1)).toContainText(/13\s130/);
  await expect(page.locator(".compact-lead").nth(1)).toContainText("Brutto");
  await expect(page.getByRole("combobox",{name:"Seurannan maksukuukausi"})).toHaveCount(0);
  await page.addStyleTag({content:"html{font-size:125%}"});
  for(const name of ["Seuranta","Historia","Analyysi","Laskuri","Asetukset"]){
    await page.getByRole("button",{name,exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
});

test("settings stay usable with empty history, reordered sections and enlarged text", async ({page})=>{
  await page.route("**/index.html",async route=>{
    const response=await route.fetch();
    const html=(await response.text()).replace('<section data-view="data" class="hidden">','<section data-view="data" class="hidden"><section><p>Lisäosio</p></section>');
    await route.fulfill({response,body:html});
  });
  await page.setViewportSize({width:320,height:840});
  await page.goto("/index.html");
  await expect(page.locator(".compact-lead")).toContainText("Ei vielä toteutuneita");
  await page.getByRole("button",{name:"Asetukset"}).click();
  await expect(page.locator("#exportButton")).toBeVisible();
  await expect(page.locator("#importButton")).toBeVisible();
  await expect(page.locator("#clearButton")).toBeVisible();
  await expect(page.locator(".compact-disclosure")).toHaveCount(2);
  await page.locator(".compact-disclosure summary").first().click();
  await expect(page.locator(".compact-disclosure[open]")).toContainText("PDF");
  await page.evaluate(async()=>{
    const db=await import("/storage.js");
    for (let i=1;i<=5;i++) {
      const source=await db.createIncomeSource("Pitkä synteettinen tulolähde "+i);
      await db.upsertRecord({id:"r-"+i,recordSchemaVersion:3,incomeSourceId:source.id,values:{
        payDate:"2025-10-30",payPeriodStart:"2025-10-01",payPeriodEnd:"2025-10-15",grossPay:4000+i,netPay:3000+i}});
    }
  });
  await page.reload();
  await page.locator("#dashboardYear").selectOption("2025");
  await expect(page.locator(".compact-lead")).toContainText("5 maksua");
  for (const scale of [125,200]) {
    await page.evaluate(scale=>document.documentElement.style.fontSize=scale+"%",scale);
    for(const tab of ["Seuranta","Historia","Analyysi","Laskuri","Asetukset"]){
      await page.getByRole("button",{name:tab,exact:true}).click();
      const over=await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.className || e.id || e.tagName));
      expect(over, tab+" "+scale).toEqual([]);
    }
  }
});
