import { test, expect } from "@playwright/test";
import { makeTextPdf } from "../staging/pdf-helper.mjs";

const payslip = (name,period,date,net,gross,ytd) => ({
  name,mimeType:"application/pdf",buffer:makeTextPdf([
    "PALKKALASKELMA","Palkkakausi "+period,"Maksupäivä "+date,
    "Maksetaan "+net,"KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul "+gross,"Ennakonpidätys -800,00",
    "Maksetaan "+net,"KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul "+ytd,"Ennakonpidätys -5 000,00"
  ])
});
const files=[
  payslip("synthetic-01.pdf","3.8.2026 - 16.8.2026","28.8.2026","2 678,39","4 698,11","63 832,82"),
  payslip("synthetic-02.pdf","17.8.2026 - 30.8.2026","11.9.2026","2 450,00","4 200,00","68 032,82")
];
const stored=page=>page.evaluate(async()=>(await import("/storage.js")).getAllRecords());

for(const width of [320,390,412]){
  test("one compact import entry, focused multi-PDF form and no tracking clutter at "+width+"px", async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.goto("/index.html");
    await expect(page.locator("#betaImportOpen")).toBeVisible();
    await expect(page.locator("#betaImportWorkspace")).toBeHidden();
    await expect(page.locator(".beta-pdf-slot")).toBeHidden();
    await expect(page.locator("#betaBatchInput")).toBeHidden();
    await expect(page.locator("#betaImportEntry")).toContainText("Yksi tai useita PDF:iä");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator("#betaImportOpen").click();
    await expect(page.locator("#betaImportWorkspace")).toBeVisible();
    await expect(page.locator("#betaBatchInput")).toBeVisible();
    await expect(page.locator("#betaBatchInput")).toHaveAttribute("multiple","");
    await expect(page.locator("#betaBatchAuto")).toBeHidden();
    await expect(page.locator("#betaBatchNext")).toBeVisible();
    await expect(page.locator("#betaBatchNext")).toBeDisabled();
    await expect(page.locator(".beta-import-file-details")).not.toHaveAttribute("open","");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator("#betaImportBack").click();
    await expect(page.locator("#betaImportWorkspace")).toBeHidden();
    await expect(page.locator("#betaImportOpen")).toBeVisible();
  });
}

test("single visible import picker accepts 2 PDFs, saves with one explicit bulk action and returns to tracking",async({page})=>{
  await page.goto("/index.html");
  const sourceId=await page.evaluate(async()=>(await (await import("/storage.js")).createIncomeSource("Testityö")).id);
  await page.reload();
  await page.locator("#betaImportOpen").click();
  await page.locator("#betaBatchInput").setInputFiles(files);
  await expect(page.locator("#betaBatchStatus")).toContainText("2 tiedostoa");
  await expect(page.locator("#betaBatchNext")).toBeDisabled();
  await page.locator("#betaBatchSource").selectOption(sourceId);
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#betaBatchNext").click();
  await expect(page.locator("#betaBatchStatus")).toContainText("tallennettu 2");
  expect(await stored(page)).toHaveLength(2);
  expect((await stored(page)).every(r=>r.incomeSourceId===sourceId)).toBe(true);
  await expect(page.locator("#betaBatchFiles li")).toHaveCount(2);
  await expect(page.locator("#resultSection")).toBeHidden();
  await page.locator("#betaImportBack").click();
  await expect(page.locator("#betaImportWorkspace")).toBeHidden();
  await expect(page.locator(".beta-compact-dashboard")).toBeVisible();
  await page.reload();
  expect(await stored(page)).toHaveLength(2);
  await expect(page.locator("#betaImportWorkspace")).toBeHidden();
});

test("history conflict decision opens import workspace but does not auto-confirm payment",async({page})=>{
  await page.goto("/index.html");
  await page.evaluate(async()=>{
    const db=await import("/storage.js"),m=await import("/model.js");
    await db.mergeManyRecords([
      {id:"old",recordSchemaVersion:3,values:{payDate:"2026-04-02",payPeriodStart:"2026-03-16",payPeriodEnd:"2026-03-29",grossPay:2400,netPay:1650,ytdTaxableIncome:12000}},
      {id:"later",recordSchemaVersion:3,values:{payDate:"2026-04-17",payPeriodStart:"2026-03-16",payPeriodEnd:"2026-03-29",grossPay:2700,netPay:1800,ytdTaxableIncome:14700}}
    ].map(m.migrateLegacyRecord));
  });
  await page.reload();
  await page.getByRole("button",{name:"Historia",exact:true}).click();
  await page.getByRole("button",{name:"Ratkaise palkkatapahtuma"}).first().click();
  await expect(page.locator("#betaImportWorkspace")).toBeVisible();
  await expect(page.locator("#conflictSection")).toBeVisible();
  const data=await stored(page);
  expect(data.filter(r=>r.resolution==="active")).toHaveLength(2);
  await page.locator("#betaImportBack").click();
  await expect(page.locator("#betaImportWorkspace")).toBeHidden();
  expect((await stored(page)).filter(r=>r.resolution==="active")).toHaveLength(2);
});
