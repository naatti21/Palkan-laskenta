import { test, expect } from "@playwright/test";

test.use({ hasTouch: true });

const showAnalysis = page => page.getByRole("button", { name: "Analyysi", exact: true }).click();
const showPlanner = page => page.getByRole("button", { name: "Laskuri", exact: true }).click();
const chart = page => page.locator("#salaryComparisonChart");
const detail = page => page.locator("#salaryComparisonDetail");
const toggle = page => page.getByRole("switch", { name: "Näytä A/B/C" });
const marker = (page, id) => chart(page).getByRole("button", { name: new RegExp("^" + id + " ·") });
const euros = text => [...text.matchAll(/([\d\s]+(?:,\d+)?)\s*€/g)]
  .map(([, value]) => Number(value.replace(/\s/g, "").replace(",", ".")));

async function open(page, rows = []) {
  await page.clock.setFixedTime(new Date("2028-10-01T12:00:00+03:00"));
  await page.goto("/index.html");
  if (!rows.length) return;
  await page.evaluate(async data => {
    const { mergeManyRecords } = await import("/storage.js");
    const { migrateLegacyRecord } = await import("/model.js");
    await mergeManyRecords(data.map(([id, month, net]) => migrateLegacyRecord({
      recordSchemaVersion: 1, id, kind: "payslip",
      values: {
        payDate: month + "-20", payPeriodStart: month + "-01",
        payPeriodEnd: month + "-15", grossPay: 4000, netPay: net
      }
    })));
  }, rows);
  await page.reload();
}

async function configurePlanner(page, year = "2026") {
  await showPlanner(page);
  const frame = page.frameLocator("#plannerFrame");
  await frame.locator("#planYear").fill(year);
  await frame.locator("#baseGross").fill("35000");
  await frame.locator("#weekendGross").fill("1000");
  await frame.locator("#betaWeekendsA").fill("3");
  await frame.locator("#betaWeekendsB").fill("9");
  await frame.locator("#betaCTarget").fill("3000");
  await expect(frame.locator("#betaCCount")).toHaveText("17 viikonloppua");
  return frame;
}

test("OFF preserves the actuals and ON plots the calculator values on the actual euro scale", async ({ page }) => {
  await open(page, [["one", "2026-01", 2600], ["two", "2026-03", 2800]]);
  const frame = await configurePlanner(page);
  const expected = {};
  for (const [id, year, month] of [
    ["A", "#betaABYearA", "#betaABMonthA"],
    ["B", "#betaABYearB", "#betaABMonthB"],
    ["C", "#betaCNet", "#betaCMonth"]
  ]) {
    expected[id] = [euros(await frame.locator(month).innerText())[0], euros(await frame.locator(year).innerText())[0]];
  }
  await showAnalysis(page);
  const actual = page.locator("#monthlyChart");
  await expect(toggle(page)).not.toBeChecked();
  await expect(actual).toBeVisible();
  await expect(actual.locator(".chart-amount")).toHaveText([/2\s*600,00/, /2\s*800,00/]);
  const original = await actual.innerHTML();
  const initialHeight = (await actual.locator("xpath=ancestor::section[1]").boundingBox()).height;
  await toggle(page).check();
  await expect(chart(page)).toBeVisible();
  await expect(actual).toBeHidden();
  await expect(chart(page).locator(".salary-comparison-line")).toHaveCount(3);
  expect(Math.abs((await actual.locator("xpath=ancestor::section[1]").boundingBox()).height - initialHeight)).toBeLessThanOrEqual(1);
  for (const [id, weekends] of [["A", 3], ["B", 9], ["C", 17]]) {
    if (id === "B") {
      await marker(page, id).focus();
      await page.keyboard.press("Space");
    } else await marker(page, id).tap();
    await expect(marker(page, id)).toHaveAttribute("aria-pressed", "true");
    const text = await detail(page).innerText();
    const [monthly, annual] = euros(text);
    expect([Math.round(monthly), Math.round(annual)]).toEqual(expected[id]);
    expect(monthly).toBeCloseTo(annual / 12, 2);
    expect(text).toContain(weekends + " työviikonloppua");
    const midpoint = await chart(page).locator(".salary-comparison-line.salary-plan-" + id).evaluate(el => parseFloat(el.style.top));
    expect(midpoint).toBeCloseTo((4000 - annual / 12) / 4000 * 100, 3);
  }
  await expect(detail(page)).toContainText("Veroviite 2026");
  await toggle(page).uncheck();
  await expect(actual).toBeVisible();
  expect(await actual.innerHTML()).toBe(original);
  await expect(chart(page)).toBeHidden();
  await expect(page.locator("[data-view='tracking'] .salary-comparison-switch")).toHaveCount(0);
});

test("changing either year gates comparison and C is visible only when the target resolves", async ({ page }) => {
  await open(page, [["old", "2026-01", 2600], ["new", "2027-01", 2700]]);
  const frame = await configurePlanner(page);
  await showAnalysis(page);
  await toggle(page).check();
  await expect(detail(page)).toContainText("Analyysin vuosi 2027 ja Laskurin suunnitteluvuosi 2026");
  await expect(chart(page).locator("button")).toHaveCount(0);
  await page.locator("#analysisYear").selectOption("2026");
  await expect(marker(page, "C")).toBeVisible();

  await showPlanner(page);
  await frame.locator("#planYear").fill("2027");
  await showAnalysis(page);
  await expect(detail(page)).toContainText("Analyysin vuosi 2026 ja Laskurin suunnitteluvuosi 2027");
  await page.locator("#analysisYear").selectOption("2027");
  await expect(detail(page)).toContainText("C:n veroviite: 2026");
  await marker(page, "C").tap();
  await expect(detail(page)).toContainText("Veroviite 2026");

  await showPlanner(page);
  await frame.locator("#betaCTarget").fill("");
  await frame.locator("#baseGross").fill("50000");
  const newA = euros(await frame.locator("#betaABYearA").innerText())[0];
  await showAnalysis(page);
  await expect(chart(page).locator(".salary-comparison-line")).toHaveCount(2);
  await expect(marker(page, "C")).toHaveCount(0);
  await marker(page, "A").tap();
  expect(Math.round(euros(await detail(page).innerText())[1])).toBe(newA);

  await showPlanner(page);
  await frame.locator("#betaWeekendsA").fill("53");
  await showAnalysis(page);
  await expect(detail(page)).toContainText("Täytä Laskuriin");
  await expect(chart(page).locator("button")).toHaveCount(0);
});

test("no history and unresolved months do not produce chart actuals", async ({ page }) => {
  await open(page);
  await showAnalysis(page);
  await toggle(page).check();
  await expect(detail(page)).toContainText("ei ole palkkahistoriaa toteumavertailuun");
  await expect(chart(page).locator("button")).toHaveCount(0);

  await open(page, [["one", "2026-02", 2600], ["conflict", "2026-02", 2700], ["clean", "2026-03", 2800]]);
  await configurePlanner(page);
  await showAnalysis(page);
  await expect(toggle(page)).toBeChecked();
  await expect(chart(page).locator("[data-month='2']")).toHaveAttribute("aria-label", /tarkistettavaa/);
  await expect(chart(page).locator("[data-month='2'] .chart-bar")).toHaveCount(0);
  await expect(chart(page).locator("[data-month='3'] .chart-bar")).toHaveCount(2);
});

test("coincident markers remain touchable at 320, 360 and 390 px and the switch survives offline", async ({ page, context }) => {
  await open(page, Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return ["pay-" + month, "2026-" + month, 2600];
  }));
  const frame = await configurePlanner(page);
  await frame.locator("#betaWeekendsB").fill("3");
  for (const [a, b, value] of [["limitA", "limitB", "60000"], ["rateA", "rateB", "20"], ["extraA", "extraB", "40"]]) {
    await frame.locator("#" + a).fill(value);
    await frame.locator("#" + b).fill(value);
  }
  await showAnalysis(page);
  await toggle(page).check();
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 820 });
    const a = marker(page, "A"), b = marker(page, "B");
    await expect(a).toBeVisible();
    const rectA = await a.boundingBox(), rectB = await b.boundingBox();
    expect(rectA.y).toBeCloseTo(rectB.y, 0);
    expect(rectB.x - rectA.x).toBeGreaterThanOrEqual(rectA.width);
    await a.tap();
    await expect(detail(page)).toHaveText(/^A ·/);
    await b.tap();
    await expect(detail(page)).toHaveText(/^B ·/);
    await expect(chart(page).locator(".salary-comparison-month")).toHaveCount(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await configurePlanner(page);
    await showAnalysis(page);
    await expect(toggle(page)).toBeChecked();
    await expect(marker(page, "C")).toBeVisible();
    await expect(chart(page).locator("[data-month='1']")).toHaveAttribute("aria-label", /2\s*600,00/);
  } finally {
    await context.setOffline(false);
  }
});
