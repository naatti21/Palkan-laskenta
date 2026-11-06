import { test, expect } from "@playwright/test";

const synthetic = (id, payday, from, until, net) => ({
  id, recordSchemaVersion:3,
  values:{payDate:payday,payPeriodStart:from,payPeriodEnd:until,
    grossPay:net+550,netPay:net,ytdTaxableIncome:net+550,
    taxCardAccumulatedIncome:net+550,taxLimit:45000}
});

test("History assigns a source to existing payslips without reimport, preserves originals and backup", async ({page}) => {
  await page.setViewportSize({width:360,height:840});
  await page.goto("/");
  const sourceId = await page.evaluate(async () => {
    const db = await import("/storage.js");
    const source = await db.createIncomeSource("Synteettinen työ A");
    await db.upsertRecord({id:"recovery-a",recordSchemaVersion:3,values:{
      payDate:"2026-07-15",payPeriodStart:"2026-07-01",payPeriodEnd:"2026-07-14",
      grossPay:1800,netPay:1400,ytdTaxableIncome:1800,taxLimit:45000}});
    await db.upsertRecord({id:"recovery-b",recordSchemaVersion:3,values:{
      payDate:"2026-08-15",payPeriodStart:"2026-08-01",payPeriodEnd:"2026-08-14",
      grossPay:2400,netPay:1900,ytdTaxableIncome:4200,taxLimit:45000}});
    return source.id;
  });
  await page.reload();
  await page.getByRole("button",{name:"Historia",exact:true}).click();
  await expect(page.locator(".history-recovery")).toContainText("2 ilman tulolähdettä");
  await page.locator(".history-recovery-disclosure summary").click();
  await page.getByRole("button",{name:"Valitse tämän vuoden lähteettömät"}).click();
  await expect(page.locator(".history-recovery-count")).toContainText("2 laskelmaa valittu");
  await page.getByRole("combobox",{name:"Historian tulolähde"}).selectOption(sourceId);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button",{name:"Vahvista tulolähde valituille"}).click();
  await expect(page.locator(".history-recovery")).toHaveCount(0);
  const actual = await page.evaluate(async () => {
    const db = await import("/storage.js");
    const model = await import("/model.js");
    const records = await db.getAllRecords();
    const visible = model.visibleRevisions(records);
    const backup = model.makeBackup(records,{incomeSources:await db.getIncomeSources()});
    return {
      total:records.length,archived:records.filter(r=>r.resolution==="superseded").length,
      sourceIds:visible.map(r=>r.incomeSourceId),
      amounts:visible.map(r=>r.values.netPay).sort((a,b)=>a-b),
      preserved:visible.every(r=>r.supersedes.length>0),
      restored:model.parseBackup(backup).length,
      originalRecords:records.filter(r=>r.resolution==="superseded").every(r=>r.incomeSourceId===null)
    };
  });
  expect(actual).toEqual({
    total:4,archived:2,sourceIds:[sourceId,sourceId],amounts:[1400,1900],
    preserved:true,restored:4,originalRecords:true
  });
  await page.reload();
  await page.getByRole("button",{name:"Historia",exact:true}).click();
  await expect(page.locator(".history-recovery")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});

test("source recovery rejects stale and mixed-source batches atomically", async ({page}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const db=await import("/storage.js");
    const m=await import("/model.js");
    const source=await db.createIncomeSource("Vahvistettu lähde");
    const a=await db.upsertRecord({id:"atom-a",recordSchemaVersion:3,values:{
      payDate:"2026-04-08",payPeriodStart:"2026-03-17",payPeriodEnd:"2026-03-31",
      grossPay:2000,netPay:1500}});
    const b=await db.upsertRecord({id:"atom-b",recordSchemaVersion:3,values:{
      payDate:"2026-05-08",payPeriodStart:"2026-04-17",payPeriodEnd:"2026-04-30",
      grossPay:2200,netPay:1650}});
    const revised=await db.assignMissingIncomeSources([a.record.id],source.id,[a.record]);
    let failed=false;
    try {
      await db.assignMissingIncomeSources([b.record.id,revised.records[0].id],source.id,
        [b.record,revised.records[0]]);
    } catch {failed=true; }
    const rows=await db.getAllRecords();
    const heads=m.visibleRevisions(rows);
    let staleRejected=false;
    try {
      await db.assignMissingIncomeSources([a.record.id],source.id,[a.record]);
    } catch {staleRejected=true;}
    return {failed,staleRejected,total:rows.length,unassigned:heads.filter(r=>!r.incomeSourceId).length,
      assigned:heads.filter(r=>r.incomeSourceId===source.id).length};
  });
  expect(result).toEqual({failed:true,staleRejected:true,total:3,unassigned:1,assigned:1});
});
