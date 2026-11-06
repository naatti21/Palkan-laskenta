import {test,expect} from "@playwright/test";
import {makeTextPdf} from "../staging/pdf-helper.mjs";

const slip = (name,period,date,net,periodGross,ytd) => ({
  name,mimeType:"application/pdf",
  buffer:makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi "+period,
    "Maksupäivä "+date,
    "Maksetaan "+net,
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul "+periodGross,
    "Ennakonpidätys -1 000,00",
    "Maksetaan "+net,
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul "+ytd,
    "Ennakonpidätys -7 000,00"
  ])
});
const first=()=>slip("palkka-a.pdf","3.8.2026 - 16.8.2026","28.8.2026","2 678,39","4 698,11","63 832,82");
const second=()=>slip("palkka-b.pdf","17.8.2026 - 30.8.2026","11.9.2026","2 450,00","4 200,00","68 032,82");
const conflict=()=>slip("palkka-korjaus.pdf","3.8.2026 - 16.8.2026","28.8.2026","2 700,00","4 698,11","63 832,82");

async function createSource(page,name="Synteettinen päätyö"){
  const sourceId=await page.evaluate(async name=>(await (await import("/storage.js")).createIncomeSource(name)).id,name);
  await page.reload();
  return sourceId;
}
async function records(page) {
  return page.evaluate(async()=> (await import("/storage.js")).getAllRecords());
}

test("select multiple PDF files, require a source and process sequentially without a duplicate",async({page})=>{
  await page.goto("/index.html");
  const id=await createSource(page);
  await page.locator("#betaBatchQueue > summary").click();
  const next=page.locator("#betaBatchNext");
  await page.locator("#betaBatchInput").setInputFiles([first(),first(),second()]);
  await expect(page.locator("#betaBatchStatus")).toContainText("3 tiedostoa");
  await expect(next).toBeDisabled();
  await page.locator("#betaBatchSource").selectOption(id);
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.locator("#betaBatchStatus")).toContainText("tallennettu 1");
  await next.click();
  await expect(page.locator("#betaBatchStatus")).toContainText("jo olemassa 1");
  await next.click();
  await expect(page.locator("#betaBatchStatus")).toContainText("tallennettu 2");
  let rows=await records(page);
  expect(rows).toHaveLength(2);
  expect(rows.every(r=>r.incomeSourceId===id)).toBe(true);
  await page.reload();
  await page.locator("#betaBatchQueue > summary").click();
  await expect(page.locator("#betaBatchStatus")).toContainText("Valitse PDF:t");
  await page.locator("#betaBatchInput").setInputFiles(first());
  await page.locator("#betaBatchSource").selectOption(id);
  await next.click();
  await expect(page.locator("#betaBatchStatus")).toContainText("jo olemassa 1");
  expect(await records(page)).toHaveLength(2);
});

test("automatic batch stops on corrected payslip and needs explicit user decision",async({page})=>{
  await page.goto("/index.html");
  const id=await createSource(page);
  await page.locator("#betaBatchQueue > summary").click();
  await page.locator("#betaBatchInput").setInputFiles([first(),conflict(),second()]);
  await page.locator("#betaBatchSource").selectOption(id);
  await page.locator("#betaBatchAuto").check();
  page.once("dialog",d=>d.accept());
  await page.locator("#betaBatchNext").click();
  await expect(page.locator("#conflictSection")).toBeVisible();
  await expect(page.locator("#betaBatchStatus")).toContainText("Käsittele avoin tarkistus");
  expect(await records(page)).toHaveLength(1);
  await expect(page.locator("#betaBatchNext")).toBeDisabled();
  await page.locator("#cancelConflictButton").click();
  await expect(page.locator("#betaBatchStatus")).toContainText("ohitettu 1");
  await page.locator("#betaBatchAuto").uncheck();
  await page.locator("#betaBatchNext").click();
  await expect(page.locator("#betaBatchStatus")).toContainText("tallennettu 2");
  expect(await records(page)).toHaveLength(2);
});

test("diagnostic panel exposes unknown source and overlapping periods without claiming full YTD",async({page})=>{
  await page.goto("/index.html");
  await page.evaluate(async()=>{
    const db=await import("/storage.js");
    const m=await import("/model.js");
    const slips=[
      {id:"a",recordSchemaVersion:3,values:{payDate:"2026-04-02",payPeriodStart:"2026-03-16",payPeriodEnd:"2026-03-29",grossPay:2200,netPay:1600,ytdTaxableIncome:14000}},
      {id:"b",recordSchemaVersion:3,values:{payDate:"2026-04-17",payPeriodStart:"2026-03-16",payPeriodEnd:"2026-03-29",grossPay:2400,netPay:1800,ytdTaxableIncome:16500}},
      {id:"latest",recordSchemaVersion:3,values:{payDate:"2026-11-06",payPeriodStart:"2026-10-19",payPeriodEnd:"2026-11-01",grossPay:3000,netPay:2000,ytdTaxableIncome:50000}}
    ];
    await db.mergeManyRecords(slips.map(s=>m.migrateLegacyRecord(s)));
  });
  await page.reload();
  const diag=page.locator("#incomeSourceDiagnostics");
  await expect(diag).toContainText("Kertymän tietolähteet");
  await diag.locator("summary").click();
  await expect(diag).toContainText("2 ristiriitaista");
  await expect(diag).toContainText("ilman tulolähdettä");
  await expect(diag).toContainText("YTD-havainto");
  await expect(page.locator("#taxCardRemaining")).toContainText("Ei luotettavaa kertymää");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
