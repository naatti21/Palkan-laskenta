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
  await expect(page.locator("#periodSummary")).toBeHidden();
  await expect(page.locator("#incomeBreakdown")).toContainText("6 367,93");
  await expect(page.locator("#overtimeBreakdown")).toContainText("11,13");
  await expect(page.locator("#bankSummary")).toContainText("−0,5");
  await expect(page.locator("#plannerFrame")).toBeVisible();
  await expect(page.locator("#monthlyDetails .month-expand")).toHaveCount(1);
  await expect(page.locator(".beta-compact-months")).not.toHaveAttribute("open", "");
  await page.locator(".beta-compact-months > summary").click();
  await page.locator("#monthlyDetails .month-expand summary").click();
  await expect(page.locator("#monthlyDetails")).toContainText("1 846,70");
  await expect(page.locator("#budgetSource")).toHaveValue("typical");
  await expect(page.locator("#budgetSummary")).toContainText("2 082,69");
  await page.locator("#budgetSource").selectOption("month");
  await expect(page.locator("#budgetSummary")).toContainText("1 922,48");
  await page.locator("#netGoal").fill("2100");
  await expect(page.locator("#netGoalResult")).toContainText("havaittu netto/brutto");
  await expect(page.locator("#netGoalResult")).toContainText("2 100,00");
  await expect(page.locator("#netGoalResult")).toContainText("tyypillinen netto");
  await expect.poll(async()=>page.evaluate(async()=>(await import("/storage.js")).getSetting("insights:v1:netGoal"))).toBe("2100");
  await page.reload();
  await page.getByRole("button",{name:"Analyysi"}).click();
  await expect(page.locator("#netGoal")).toHaveValue("2100");
  await expect(page.locator("#pdfInput")).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
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
  await expect(page.getByRole("heading",{name:"Työn ja palkan aikajana"})).toBeHidden();
  await expect(page.locator("#plannerFrame")).toBeVisible();
});

test("embedded annual planner uses local Palkka history, preserves manual edits and offers 0/3/5/10",async({page})=>{
 await page.setViewportSize({width:360,height:780});
 await page.goto("/index.html");
 const backup=await page.evaluate(async()=>{
  const m=await import("/model.js");
  const rows=[1,2,3].map(n=>m.migrateLegacyRecord({recordSchemaVersion:1,id:"planner-fake-"+n,kind:"payslip",
    values:{payDate:"2026-0"+n+"-09",payPeriodStart:"2026-0"+n+"-01",payPeriodEnd:"2026-0"+n+"-07",grossPay:3000,netPay:1850,ytdTaxableIncome:3000*n,kta:25,taxRate:31,additionalRate:47},
    payLines:[{code:"13001",label:"Palkkiotyö",quantity:80,amount:1600,unitPrice:20},{code:"13101",label:"Tuotantopalkkio",quantity:80,amount:400,unitPrice:5},{code:"90100",amount:-210},{code:"90200",amount:-26},{code:"90400",amount:-30},{code:"90920",amount:-39},...(n===2?[{code:"55301",amount:1200}]:[])],
    fingerprints:["synthetic-planner-"+n],fieldMeta:{},corrections:{},notices:[],parser:{version:"test",confidence:1,documentType:"payslip",sourceProfile:"synthetic"}}));
  return JSON.stringify(m.makeBackup(rows));
 });
 await page.getByRole("button",{name:"Data"}).click();
 await page.locator("#backupInput").setInputFiles({name:"synthetic-planner.json",mimeType:"application/json",buffer:Buffer.from(backup)});
 await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
 await page.getByRole("button",{name:"Analyysi"}).click();
 const planner=page.frameLocator("#plannerFrame");
 await expect(planner.locator("#historyStatus")).toContainText("Beta ehdotti luvut", {timeout:15000});
 await expect(planner.locator("#baseGross")).toHaveValue("52000");
 await expect(planner.locator("#holiday")).toHaveValue("1200");
 await expect(planner.locator("#bonus")).toHaveValue("0");
 await expect(planner.locator("#weekendMethod")).toHaveValue("manual");
 await expect(planner.locator("#rulesConfirmed")).not.toBeChecked();
 await expect(planner.locator("#wageModelNote")).toContainText("Tuntipalkkainen");
 await expect(planner.locator("#weekendGross")).toHaveValue("0");
 await planner.locator("#weekendMethod").selectOption("paylines");
 await expect(planner.locator("#validation")).toContainText("Vahvista ensin");
 await planner.locator("#rulesConfirmed").check();
 await expect(planner.locator("#validation")).toContainText("skenaario");
 await expect(planner.locator("#rateA")).toHaveValue("30");
 await expect(planner.locator("#rateConfirmedA")).not.toBeChecked();
 await expect(planner.locator("#samples")).toContainText("3");
 await expect(planner.locator("#samples")).toContainText("5");
 await planner.locator("#baseGross").fill("61000");
 await page.getByRole("button",{name:"Historia"}).click();
 await page.getByRole("button",{name:"Analyysi"}).click();
 await expect(planner.locator("#baseGross")).toHaveValue("61000");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
 await expect(page.locator("#pdfInput")).toBeDisabled();
});
test("historical tax card percentages never become certified 2027 scenario percentages",async({page})=>{
 await page.goto("/index.html");
 await page.getByRole("button",{name:"Analyysi"}).click();
 const planner=page.frameLocator("#plannerFrame");
 await expect(planner.locator("#rateConfirmedA")).not.toBeChecked();
 await expect(planner.locator("#rateConfirmedB")).not.toBeChecked();
 await expect(planner.locator("#taxRateVerification")).toContainText("oletuksia");
 await expect(page.getByRole("heading",{name:"Milloin seuraavasta eurosta jää vähemmän?"})).toBeHidden();
});
test("beta offline service worker caches explanatory simulations locally",async({page})=>{
 await page.goto("/index.html");
 await expect.poll(async()=>page.evaluate(async()=>{
   await navigator.serviceWorker.ready;
   const keys=await caches.keys();
   const cache=await caches.open(keys.find(x=>x.startsWith("palkka-beta-v")));
   return (await cache.keys()).map(req=>new URL(req.url).pathname);
 })).toEqual(expect.arrayContaining(["/scenario-model.js","/scenario-ui.js","/experiments/year-planner/index.html"]));
});
