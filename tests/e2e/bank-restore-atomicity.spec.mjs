import {test,expect} from "@playwright/test";

// Synthetic-only persisted backup import checks. Do not use real payroll fixtures.
test("invalid bank snapshots and conflicting IDs do not partially import a new payslip",async({page})=>{
 await page.goto("/index.html");
 const {initial,conflicting,invalid,legacy,expectedId}=await page.evaluate(async()=>{
   const model=await import("/model.js");
   const rec=(id,start,end,date,gross)=>model.migrateLegacyRecord({
     recordSchemaVersion:1,id,kind:"payslip",
     values:{payDate:date,payPeriodStart:start,payPeriodEnd:end,grossPay:gross,netPay:gross*.6,
       ytdTaxableIncome:gross+10000},
     payLines:[],fingerprints:["qa-synthetic-"+id],fieldMeta:{},corrections:{},notices:[],
     parser:{version:"qa-test",confidence:1,documentType:"payslip",sourceProfile:"qa-test"}
   });
   const first=rec("qa-initial-bank","2026-09-01","2026-09-14","2026-09-25",3000);
   const next=rec("qa-after-bank","2026-09-15","2026-09-28","2026-10-09",3200);
   const anchor={id:"bank-qa-anchored",asOfDate:"2026-10-12",balanceMinutes:2955,
     source:"time-system",note:"synthetic evidence",recordedAt:"2026-10-12T12:00:00.000Z",corrections:[]};
   const initial=model.makeBackup([first],{bankSnapshots:[anchor]});
   const conflicting=model.makeBackup([next],{bankSnapshots:[{...anchor,balanceMinutes:2910}]});
   const invalid=structuredClone(conflicting);
   invalid.bankSnapshots[0].id="bank-qa-invalid";
   invalid.bankSnapshots[0].asOfDate="2026-02-30";
   const legacy=model.makeBackup([next]);
   delete legacy.bankSnapshots; // old version-2 backup written before bank support
   return {initial,conflicting,invalid,legacy,expectedId:next.id};
 });
 await page.getByRole("button",{name:"Data"}).click();
 const file=async(name,data)=>page.locator("#backupInput").setInputFiles({
   name,mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))
 });
 const state=()=>page.evaluate(async()=>{
   const s=await import("/storage.js");
   return {records:(await s.getAllRecords()).map(x=>x.id).sort(),bank:await s.getSetting("worktimeBankAnchors:v1")};
 });
 await file("initial-synthetic.json",initial);
 await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
 await expect(page.locator("#bankLatest")).toContainText("49 h 15 min");
 const baseline=await state();
 expect(baseline.records).toHaveLength(1);
 expect(baseline.bank).toHaveLength(1);
 await file("conflicting-synthetic.json",conflicting);
 await expect(page.locator("#backupStatus")).toContainText("Palautus epäonnistui");
 await expect(page.locator("#backupStatus")).toContainText("Ristiriitainen");
 expect(await state()).toEqual(baseline);
 await file("invalid-synthetic.json",invalid);
 await expect(page.locator("#backupStatus")).toContainText("Palautus epäonnistui");
 expect(await state()).toEqual(baseline);
 await page.reload();
 expect(await state()).toEqual(baseline);
 await page.getByRole("button",{name:"Data"}).click();
 await file("old-version-synthetic.json",legacy);
 await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
 const final=await state();
 expect(final.records).toHaveLength(2);
 expect(final.records).toContain(expectedId);
 expect(final.bank).toEqual(baseline.bank);
 await expect(page.locator("#bankPrompt")).toBeHidden();
 await file("old-version-synthetic.json",legacy);
 expect(await state()).toEqual(final);
});

test("a genuine zero bank balance is not mistaken for missing; correction retains minutes and date",async({page})=>{
 await page.goto("/index.html");
 await page.getByRole("button",{name:"Data"}).click();
 await expect(page.locator("#bankLatest")).toContainText("Ei vielä");
 await page.locator("#bankOpenForm").click();
 await page.locator("#bankBalanceInput").fill("0:00");
 await page.locator("#bankDateInput").fill("2026-10-12");
 await page.locator("#bankSaveButton").click();
 await expect(page.locator("#bankLatest")).toContainText("0 h 00 min");
 await page.locator("[data-bank-edit]").click();
 await page.locator("#bankBalanceInput").fill("-0:30");
 await page.locator("#bankDateInput").fill("2026-10-13");
 await page.locator("#bankSaveButton").click();
 await expect(page.locator("#bankLatest")).toContainText("−0 h 30 min");
 await expect(page.locator("#bankLatest")).toContainText("13.10.2026");
 const snapshots=await page.evaluate(async()=>{
   return await (await import("/storage.js")).getSetting("worktimeBankAnchors:v1");
 });
 expect(snapshots).toHaveLength(1);
 expect(snapshots[0].balanceMinutes).toBe(-30);
 expect(snapshots[0].corrections[0].balanceMinutes).toBe(0);
 expect(snapshots[0].corrections[0].asOfDate).toBe("2026-10-12");
 await page.reload();
 await page.getByRole("button",{name:"Data"}).click();
 await expect(page.locator("#bankLatest")).toContainText("−0 h 30 min");
 const after=await page.evaluate(async()=>{
   return await (await import("/storage.js")).getSetting("worktimeBankAnchors:v1");
 });
 expect(after).toEqual(snapshots);
});
