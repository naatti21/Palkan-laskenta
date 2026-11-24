import { test, expect } from "@playwright/test";

// Synthetic data only. Keep real payroll documents and identifying details out of GitHub.
test("Beta dashboard remains compact and import stays gated", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#pdfInput")).toBeEnabled();
  await expect(page.locator(".beta-compact-dashboard")).toBeVisible();
  await expect(page.locator(".beta-primary-metrics")).toHaveCount(1);
  await expect(page.locator("#dashboardNote")).toContainText("ei ole vielä palkkalaskelmia");
  await expect(page.locator(".beta-taxcard-progress")).toBeVisible();
  await expect(page.locator('[data-view="planning"]')).toHaveCount(1);
  await expect(page.locator(".planner-fold")).toHaveCount(0);
  await expect(page.locator("#betaAnalysisTopics button")).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});

test("History opens a single stored payslip and nested source lines without HTML injection", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(async () => {
    const { makeRecordFromParsed } = await import("/model.js");
    const { clearAllRecords, upsertRecord } = await import("/storage.js");
    await clearAllRecords();
    const source = {
      payDate: "2026-10-23",
      payPeriodStart: "2026-10-01",
      payPeriodEnd: "2026-10-14",
      grossPay: 2950,
      netPay: 1988.94,
      withholdingPeriod: -610.62,
      ytdTaxableIncome: 55300,
      taxLimit: 40000,
      taxCardAccumulatedIncome: 21546.39,
      overtimeHours: 4.5
    };
    const fields = Object.fromEntries(Object.entries(source).map(([key, value]) =>
      [key, { value, confidence: 1, source: "synthetic-ui-test" }]
    ));
    const record = makeRecordFromParsed({
      fields,
      documentType: "payslip",
      parserVersion: "ui-test",
      payLines: [{ code: "123", label: "<img src=x onerror=alert(1)>", quantity: 4, unitType: "h", amount: 100 }]
    }, "synthetic-ui-only");
    await upsertRecord(record);
  });
  await page.reload();
  await page.locator('[data-view-target="history"]').click();
  const item = page.locator(".payslip-item");
  await expect(item).toHaveCount(1);
  await expect(item).not.toHaveAttribute("open", "");
  await item.locator("summary.payslip-summary").click();
  await expect(item).toHaveAttribute("open", "");
  await expect(item.locator(".payslip-fields")).toContainText("Bruttopalkka");
  await expect(item.locator(".payslip-fields")).toContainText("1 988");
  await item.locator(".payslip-lines > summary").click();
  await expect(item.locator(".payslip-line-list")).toContainText("<img src=x onerror=alert(1)>");
  await expect(item.locator("img")).toHaveCount(0);
  await item.locator("summary.payslip-summary").click();
  await expect(item).not.toHaveAttribute("open", "");
});

test("Calculator is on its own tab and Analysis remains independently expandable", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('[data-view-target="analysis"]').click();
  await expect(page.locator("#plannerFrame")).toBeHidden();
  await expect(page.locator("#betaAnalysisTopics button")).toHaveCount(4);
  await page.getByRole("button",{name:"Ylityöt",exact:true}).click();
  await expect(page.locator("#betaWeekendTracker")).toBeVisible();
  await expect(page.locator("#analysisYear")).toBeVisible();
  await page.locator('[data-view-target="planning"]').click();
  await expect(page.getByRole("heading",{name:"Vuosisuunnittelu"})).toBeVisible();
  await expect(page.locator("#plannerFrame")).toBeVisible();
});

test("narrow navigation keeps tool inputs and calculator edits across views", async ({ page }) => {
  const startupErrors = [];
  page.on("pageerror", error => startupErrors.push(error.message));
  for (const width of [320,390]) {
    await page.setViewportSize({width,height:760});
    await page.goto("/");
    expect(startupErrors).toEqual([]);
    await page.locator('[data-view-target="analysis"]').click();
    for (const [topic, selector] of [["Palkat","#monthlyChart"],["Ylityöt","#betaWeekendTracker"],["Erittelyt","#monthlyDetails"],["Työkalut","#netGoal"]]) {
      await page.getByRole("button",{name:topic,exact:true}).click();
      await expect(page.locator(selector)).toBeVisible();
      await expect(page.locator("#analysisYear")).toBeVisible();
    }
    await page.locator("#netGoal").fill("2600");
    await page.locator('[data-view-target="planning"]').click();
    const planner=page.frameLocator("#plannerFrame");
    await planner.locator("#baseGross").fill("52000");
    await planner.getByRole("link",{name:"Siirry tuloksiin"}).first().click();
    await expect(planner.getByRole("navigation",{name:"Muokkaa suunnitelmaa"})).toBeInViewport();
    await expect(page.locator(".tabs")).toBeInViewport();
    await page.locator('[data-view-target="analysis"]').click();
    await expect(page.locator("#netGoal")).toHaveValue("2600");
    await page.locator('[data-view-target="planning"]').click();
    await expect(planner.locator("#baseGross")).toHaveValue("52000");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
});

test("visible C-goal workflow and shared chart segments do not hide outcomes",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto("/index.html");
  await page.getByRole("button",{name:"Laskuri"}).click();
  const frame=page.frameLocator("#plannerFrame");
  for(const selector of ["#weekendPayDetails","#betaCGoalSection","#plannerAdvanced",
    "#betaABYearA","#netChart","#netDifferenceChart"])
    await expect(frame.locator(selector)).toBeVisible();
  const order=await frame.locator("body").evaluate(()=>[
    "weekendPayDetails","tax-title","betaAnnualABSummary","betaCGoalSection","plannerAdvanced"
  ].map(id=>document.getElementById(id))
   .map(el=>[el.id,el.getBoundingClientRect().top + window.scrollY])
   .sort((a,b)=>a[1]-b[1]).map(a=>a[0]));
  expect(order).toEqual(["weekendPayDetails","tax-title","betaAnnualABSummary",
    "betaCGoalSection","plannerAdvanced"]);
  await frame.locator("#baseGross").fill("52000");
  await frame.locator("#weekendGross").fill("1000");
  await frame.locator("#rateA").fill("30");
  await frame.locator("#rateB").fill("30");
  await frame.locator("#limitA").fill("77000");
  await frame.locator("#limitB").fill("77000");
  await expect(frame.locator("#netChartSharedNote")).toContainText("A = B");
  await expect(frame.locator("#grossChartSharedNote")).toContainText("A:n tuloraja = B:n tuloraja");
  await frame.locator("#betaCTarget").fill("3500");
  await expect(frame.locator("#betaCReason")).not.toBeEmpty();
  await expect(frame.locator("#betaCFreeWeekends")).not.toBeEmpty();
  await expect(frame.locator("#betaABYearA")).toHaveText(await frame.locator("#betaABYearB").textContent());
});
