import { test, expect } from "@playwright/test";

test("beta branding, exact origin and offline analytics shell", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#beta-banner")).toContainText("BETA");
  await expect(page).toHaveTitle("Palkka BETA");
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.getByRole("heading", { name: "Ansiot ja työaika" })).toBeVisible();
  const info = await page.evaluate(async () => (await (await fetch("./build-info.json")).json()));
  expect(info.environment).toBe("beta");
  expect(info.origin).toBe("http://127.0.0.1:4177");
  await expect.poll(async () => page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const cachesHere = await caches.keys();
    return cachesHere.some(key => key.startsWith("palkka-beta-v"));
  }), { timeout: 15000 }).toBeTruthy();
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.startsWith("palkka-beta-v")));
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  expect(cached).toContain("/analytics.js");
  expect(cached).toContain("/beta-entry.mjs");
});

test("another origin cannot start a beta application from the same files", async ({ page }) => {
  await page.goto("http://127.0.0.1:4178/index.html");
  await expect(page.locator("#beta-banner")).toContainText("BETA ESTETTY");
  await expect(page.locator("main")).toHaveCount(0);
  const worker = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(x => x.length));
  expect(worker).toBe(0);
});

test("synthetic production-format JSON backup restores locally into beta analysis, survives reload", async ({ page }) => {
  await page.goto("/index.html");
  const content = await page.evaluate(async () => {
    const model = await import("/model.js");
    const a = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "beta-synthetic-2026-10",
      kind: "payslip",
      values: {
        payDate: "2026-10-09",
        payPeriodStart: "2026-09-21",
        payPeriodEnd: "2026-10-04",
        grossPay: 3212.79,
        netPay: 1831.61,
        overtimeHours: null,
        ytdTaxableIncome: 73881.95
      },
      payLines: [], fingerprints: ["synthetic-beta-01"],
      fieldMeta: {}, corrections: {}, notices: [],
      parser: { version: "qa", confidence: 1, documentType: "payslip", sourceProfile: "qa" }
    });
    return JSON.stringify(model.makeBackup([a]));
  });
  await page.getByRole("button", { name: "Data" }).click();
  await page.locator("#backupInput").setInputFiles({
    name: "synthetic-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(content, "utf8")
  });
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#analysisNote")).toContainText("1 palkkalaskelmaa");
  await expect(page.locator("#analysisMetrics")).toContainText("3 212,79");
  await expect(page.locator("#analysisMetrics")).toContainText("1 831,61");
  await expect(page.locator("#analysisMetrics")).toContainText("Ei tietoa");
  await page.reload();
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#analysisMetrics")).toContainText("1 831,61");
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(1);
  expect(records[0].values.grossPay).toBe(3212.79);
  expect(records[0].values.overtimeHours).toBe(null);
});

test("beta source does not overwrite QA staging, main or browser origin", async ({ page }) => {
  await page.goto("/index.html");
  const registration = await page.evaluate(async () => {
    const item = await navigator.serviceWorker.ready;
    return { scope: item.scope, script: item.active?.scriptURL || "" };
  });
  expect(registration.scope).toBe("http://127.0.0.1:4177/");
  expect(registration.script).toBe("http://127.0.0.1:4177/sw.js");
  const cachesHere = await page.evaluate(() => caches.keys());
  for (const item of cachesHere) {
    expect(item).not.toContain("palkka-staging-v");
    expect(item).not.toBe("palkka-pwa-v16");
  }
});

test("expanded analytics shows cash date, cross-year period, OT evidence, budget and local scenario persistence", async ({ page }) => {
  await page.goto("/index.html");
  const fixture = await page.evaluate(async () => {
    const model = await import("/model.js");
    const src = (id,payDate,start,end,gross,net,otRows,bank={}) => model.migrateLegacyRecord({
      recordSchemaVersion:1,id,kind:"payslip",values:{
        payDate,payPeriodStart:start,payPeriodEnd:end,grossPay:gross,netPay:net,
        ytdTaxableIncome:payDate.endsWith("-23")?6367.93:3343.07,
        overtimeHours:otRows.reduce((sum,line)=>sum+line.quantity,0),
        overtimeCompensation:otRows.reduce((sum,line)=>sum+line.amount,0),
        withholdingPeriod:payDate.endsWith("-23")?-877.21:-969.49,
        kta:24.59,worktimeBankUseHours:bank.use??null,worktimeBankAddHours:bank.add??null
      },payLines:otRows,
      fingerprints:[id],fieldMeta:{},corrections:{},notices:[],
      parser:{version:"test",confidence:1,documentType:"payslip",sourceProfile:"synthetic"}
    });
    return JSON.stringify(model.makeBackup([
      src("synthetic-1","2026-01-09","2025-12-22","2026-01-04",3343.07,2014.61,[
        {code:"20040",category:"overtime_100_daily",label:"Ylityö 100% vrk",quantity:3.13,unitPrice:23.99,amount:75.09,unitType:"unit"}
      ],{use:1.25,add:-.5}),
      src("synthetic-2","2026-01-23","2026-01-05","2026-01-18",3024.86,1830.35,[
        {code:"20050",category:"overtime_50_weekly",label:"Ylityö 50% vko",quantity:8,unitPrice:23.99,amount:95.96,unitType:"unit"}
      ])
    ]));
  });
  await page.getByRole("button", { name: "Data" }).click();
  await page.locator("#backupInput").setInputFiles({name:"synthetic-insights.json",mimeType:"application/json",buffer:Buffer.from(fixture,"utf8")});
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#periodSummary")).toContainText("22.12.2025");
  await expect(page.locator("#periodSummary")).toContainText("9.1.2026");
  await expect(page.locator("#incomeBreakdown")).toContainText("6 367,93");
  await expect(page.locator("#incomeBreakdown")).toContainText("3 844,96");
  await expect(page.locator("#overtimeBreakdown")).toContainText("11,13");
  await expect(page.locator("#bankSummary")).toContainText("−0,5");
  await expect(page.locator("#monthlyDetails .month-expand")).toHaveCount(1);
  await page.locator(".month-expand summary").click();
  await expect(page.locator("#monthlyDetails")).toContainText("1 846,70");
  await page.locator("#retainedRate").fill("60");
  await expect(page.locator("#overtimeScenario")).toContainText("102,63");
  await expect(page.locator("#overtimeScenario")).toContainText("Odottaa vahvistettuja tunteja");
  await page.locator("#confirmedOvertime").fill("10");
  await expect(page.locator("#overtimeScenario")).toContainText("10,26");
  await page.locator("#netGoal").fill("2100");
  await expect(page.locator("#netGoalResult")).toContainText("3 500,00");
  await expect(page.locator("#budgetSummary")).toContainText("1 922,48");
  await expect.poll(async () => page.evaluate(async () =>
    (await import("/storage.js")).getSetting("insights:v1:netGoal")
  )).toBe("2100");
  await page.reload();
  await page.getByRole("button", { name: "Analyysi" }).click();
  await expect(page.locator("#retainedRate")).toHaveValue("60");
  await expect(page.locator("#confirmedOvertime")).toHaveValue("10");
  await expect(page.locator("#netGoal")).toHaveValue("2100");
  await expect(page.locator("#overtimeScenario")).toContainText("10,26");
  await expect(page.locator("#pdfInput")).toBeDisabled();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("new analytical modules load in offline beta cache", async ({ page }) => {
  await page.goto("/index.html");
  await expect.poll(async()=>page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    const names=await caches.keys();
    const cache=await caches.open(names.find(n=>n.startsWith("palkka-beta-v")));
    return (await cache.keys()).map(r=>new URL(r.url).pathname);
  })).toEqual(expect.arrayContaining(["/insights.js","/insights-ui.js"]));
  await page.getByRole("button",{name:"Analyysi"}).click();
  await expect(page.getByRole("heading",{name:"Työn ja palkan aikajana"})).toBeVisible();
});

test("tax-card 100 euro net, bend and weekend crossover from synthetic local backup", async ({page})=>{
 await page.setViewportSize({width:360,height:780});
 await page.goto("/index.html");
 const backup=await page.evaluate(async()=>{
  const m=await import("/model.js");
  const x=m.migrateLegacyRecord({recordSchemaVersion:1,id:"synthetic-tax",
   kind:"payslip",values:{payDate:"2026-10-09",payPeriodStart:"2026-09-21",payPeriodEnd:"2026-10-04",
    grossPay:3000,netPay:2000,ytdTaxableIncome:12000,
    taxRate:30,additionalRate:47,taxLimit:6000,taxCardAccumulatedIncome:5500,
    overtimeHours:null},payLines:[],fingerprints:["fake-tax"],
   fieldMeta:{},corrections:{},notices:[],
   parser:{version:"test",confidence:1,documentType:"payslip",sourceProfile:"test"}});
  return JSON.stringify(m.makeBackup([x]));
 });
 await page.getByRole("button",{name:"Data"}).click();
 await page.locator("#backupInput").setInputFiles({
  name:"synthetic-tax.json",mimeType:"application/json",buffer:Buffer.from(backup,"utf8")});
 await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
 await page.getByRole("button",{name:"Analyysi"}).click();
 await expect(page.getByRole("heading",{name:"Milloin seuraavasta eurosta jää vähemmän?"})).toBeVisible();
 await expect(page.locator("#scenarioBaseRate")).toHaveValue("30");
 await expect(page.locator("#scenarioExtraRate")).toHaveValue("47");
 await expect(page.locator("#scenarioRemaining")).toHaveValue("500");
 await expect(page.locator("#scenarioHundred")).toContainText("70,00");
 await expect(page.locator("#scenarioTaxChart svg")).toBeVisible();
 await expect(page.locator("#scenarioWeekendChart svg")).toBeVisible();
 const overview=await page.locator("#scenarioWeekendMetrics").innerText();
 expect(overview).toContain("350,00");
 await page.locator("#scenarioFreeValue").fill("20");
 await expect(page.locator("#scenarioWeekendExplanation")).toContainText("viikonloppuna 2");
 await page.locator("#scenarioRemaining").fill("50");
 await expect(page.locator("#scenarioHundred")).toContainText("61,50");
 await expect(page.locator("#scenarioTaxStatus")).toContainText("50,00");
 await page.locator("#scenarioOtherRate").fill("7");
 await expect(page.locator("#scenarioHundred")).toContainText("54,50");
 await expect.poll(async()=>page.evaluate(async()=>(await import("/storage.js")).getSetting("scenario:v1:2026"))).toMatchObject({scenarioRemaining:50,scenarioOtherRate:7,scenarioFreeValue:20});
 await page.reload();
 await page.getByRole("button",{name:"Analyysi"}).click();
 await expect(page.locator("#scenarioRemaining")).toHaveValue("50");
 await expect(page.locator("#scenarioOtherRate")).toHaveValue("7");
 await expect(page.locator("#scenarioHundred")).toContainText("54,50");
 const recordCount=await page.evaluate(async()=>(await (await import("/storage.js")).getAllRecords()).length);
 expect(recordCount).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 await expect(page.locator("#pdfInput")).toBeDisabled();
});
test("missing explicit tax card accumulation prevents guessing from unrelated YTD",async({page})=>{
 await page.goto("/index.html");
 const backup=await page.evaluate(async()=>{
  const m=await import("/model.js");
  return JSON.stringify(m.makeBackup([m.migrateLegacyRecord({recordSchemaVersion:1,id:"missing-tax",
   kind:"payslip",values:{payDate:"2026-10-09",payPeriodStart:"2026-09-21",payPeriodEnd:"2026-10-04",
    grossPay:5000,netPay:3500,ytdTaxableIncome:90000,
    taxRate:32.5,additionalRate:47,taxLimit:40000,taxCardAccumulatedIncome:null},
   payLines:[],fingerprints:["fake-not-real"],fieldMeta:{},corrections:{},notices:[],
   parser:{version:"test",confidence:1,documentType:"payslip",sourceProfile:"test"}})]));
 });
 await page.getByRole("button",{name:"Data"}).click();
 await page.locator("#backupInput").setInputFiles({name:"missing-card.json",mimeType:"application/json",buffer:Buffer.from(backup,"utf8")});
 await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
 await page.getByRole("button",{name:"Analyysi"}).click();
 await expect(page.locator("#scenarioRemaining")).toHaveValue("");
 await expect(page.locator("#scenarioTaxStatus")).toContainText("Ilman näitä en arvaa");
 await expect(page.locator("#scenarioTaxChart svg")).toHaveCount(0);
 await page.locator("#scenarioRemaining").fill("0");
 await expect(page.locator("#scenarioHundred")).toContainText("53,00");
 await expect(page.locator("#scenarioTaxChart svg")).toBeVisible();
});
test("beta offline service worker caches explanatory simulations locally",async({page})=>{
 await page.goto("/index.html");
 await expect.poll(async()=>page.evaluate(async()=>{
   await navigator.serviceWorker.ready;
   const keys=await caches.keys();
   const cache=await caches.open(keys.find(x=>x.startsWith("palkka-beta-v")));
   return (await cache.keys()).map(req=>new URL(req.url).pathname);
 })).toEqual(expect.arrayContaining(["/scenario-model.js","/scenario-ui.js"]));
});
