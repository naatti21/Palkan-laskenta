import { test, expect, devices } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeTextPdf } from "../staging/pdf-helper.mjs";

const require = createRequire(import.meta.url);
const axe = require.resolve("axe-core/axe.min.js");
const widths = [320, 360, 390, 430, 768, 1280];
const time = new Date("2026-12-22T12:00:00+02:00");
const tab = (page, name) => page.getByRole("button", {name, exact: true});
const ready = page => expect(page.locator("#dashboardYear option").first()).toBeAttached();

async function open(page) {
  await page.clock.setFixedTime(time);
  await page.goto("/");
  await ready(page);
}

async function backup(page) {
  return page.evaluate(async () => {
    const { makeBackup, migrateLegacyRecord } = await import("/model.js");
    const values = [
      ["2025-12-29", 3290.15, 2450.22, "paatyot"],
      ["2026-01-20", 3515.05, 2603.41, "paatyot"],
      ["2026-03-20", 4109.94, 3089.15, "paatyot", 14],
      ["2026-06-20", 4893.60, 3504.72, "paatyot", 0, "Lomaraha"],
      ["2026-08-20", 3554.20, 2640.57, "paatyot"],
      ["2026-08-20", 482.30, 359.67, "keikat"],
      ["2026-11-20", 3604.60, 2688.48, "paatyot"],
      ["2026-12-20", 3910.15, 2897.30, "paatyot"]
    ];
    const original = migrateLegacyRecord({
      id: "synthetic-original", recordSchemaVersion: 3, incomeSourceId: "paatyot", resolution: "superseded",
      values: {payDate: "2026-12-20", grossPay: 3810.15, netPay: 2797.30}
    });
    const records = values.map(([payDate, grossPay, netPay, incomeSourceId, overtimeHours, bonus], index) => migrateLegacyRecord({
      id: "example-" + index, recordSchemaVersion: 3, incomeSourceId,
      supersedes: index === 7 ? [original.id] : [],
      values: { payDate, grossPay, netPay, overtimeHours,
        payPeriodStart: payDate.slice(0, 7) + "-01", payPeriodEnd: payDate.slice(0, 7) + "-15",
        taxRate: index < 4 ? 22 : 25, additionalRate: 44,
        taxLimit: index < 4 ? 44000 : 48000, taxCardAccumulatedIncome: 2000 + index * 2300 },
      payLines: bonus ? [{ label: bonus, amount: 900 }] : []
    }));
    return JSON.stringify(makeBackup([...records, original], {
      incomeSources: [{id:"paatyot", name:"Päätyö"}, {id:"keikat", name:"Keikkatyö"}]
    }));
  });
}

async function restore(page, payload) {
  await tab(page, "Asetukset").click();
  await page.locator("#backupInput").setInputFiles({
    name: "synteettinen.json", mimeType: "application/json", buffer: Buffer.from(payload)
  });
}

async function planner(page) {
  await tab(page, "Laskuri").click();
  const frame = page.frameLocator("#plannerFrame");
  await frame.locator("#planYear").fill("2026");
  await frame.locator("#baseGross").fill("35000");
  await frame.locator("#weekendGross").fill("1000");
  for (const id of ["holiday", "bonus", "other", "raise"]) await frame.locator("#" + id).fill("0");
  await frame.locator("#betaWeekendsA").fill("3");
  await frame.locator("#betaWeekendsB").fill("9");
  await frame.locator("#betaCTarget").fill("3000");
  await expect(frame.locator("#betaCCount")).toHaveText("17 viikonloppua");
  return frame;
}

test("all five views fit six widths and navigation exposes the current view", async ({ page }) => {
  await open(page);
  await expect(page.locator("#retailWelcome")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", {name:"Siirry sisältöön"})).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#activeView")).toBeFocused();
  await restore(page, await backup(page));
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  for (const width of widths) {
    await page.setViewportSize({width, height: 860});
    for (const name of ["Seuranta", "Analyysi", "Historia", "Laskuri", "Asetukset"]) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-current", "page");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, name + " at " + width).toBeLessThanOrEqual(1);
    }
  }
  await page.addScriptTag({path:axe});
  const checks = await page.evaluate(async () => {
    const result = await window.axe.run({
      runOnly:{type:"rule",values:["button-name","label","aria-valid-attr-value","html-has-lang","document-title","duplicate-id-aria"]}
    });
    return result.violations.map(item => ({id:item.id, nodes:item.nodes.map(node => node.target)}));
  });
  expect(checks).toEqual([]);
});

test("planner layout stays separated across the full iframe and expanded comparison", async ({page}) => {
  await open(page);
  const frame = await planner(page);
  const compare = frame.locator("#allComparisonsToggle");
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({width,height:860});
    for (const expanded of [false, true]) {
      if ((await compare.getAttribute("aria-expanded") === "true") !== expanded) await compare.click();
      await expect.poll(() => frame.locator(".shell").evaluate(shell => {
        const year = shell.querySelector("#planYear");
        const elements = [...shell.querySelectorAll("h1,h2,h3,h4,label,input,select,button,summary")]
          .map(el => ({el, rect:el.getBoundingClientRect()}))
          .filter(({el,rect}) => rect.width > 1 && rect.height > 1 && rect.right > 0 &&
            getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).opacity !== "0");
        const errors = [];
        const name = el => el.id || el.textContent.trim().slice(0,38) || el.tagName;
        for (const [index, a] of elements.entries()) {
          if (a.rect.right > document.documentElement.clientWidth + 1) errors.push(name(a.el) + " exceeds viewport");
          for (const b of elements.slice(index+1)) {
            // Labels intentionally wrap their inputs, and some buttons contain text elements.
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const overlapX = Math.min(a.rect.right,b.rect.right) - Math.max(a.rect.left,b.rect.left);
            const overlapY = Math.min(a.rect.bottom,b.rect.bottom) - Math.max(a.rect.top,b.rect.top);
            if (overlapX > 0.5 && overlapY > 0.5) errors.push(name(a.el) + " overlaps " + name(b.el));
          }
        }
        const heading = shell.querySelector("#history-title").getBoundingClientRect();
        if (year.getBoundingClientRect().top - heading.bottom < 4) errors.push("Year is too close to history heading");
        if (shell.getBoundingClientRect().bottom + window.scrollY > innerHeight + 1) errors.push("Iframe clips its scrollable content");
        return errors;
      }), {message:`${width} px, comparison expanded=${expanded}`}).toEqual([]);
    }
  }
  await page.evaluate(() => {
    document.getElementById("plannerFrame").contentWindow.postMessage({
      type:"palkka:planner:prefill", backup:{app:"Palkka PWA",records:null}
    }, location.origin);
  });
  await expect(frame.locator("#historyStatus")).toContainText("Palkkahistoriasta ei saatu luotettavia ehdotuksia");
  await expect(frame.locator("body")).not.toContainText(/\bBeta(?:n|ssa)?\b/i);
});

test("retired history remains inspectable and PDF selection stays first", async ({page}) => {
  await page.setViewportSize({width:360,height:860});
  await open(page);
  await page.locator("#betaImportOpen").click();
  const picker = page.locator("#betaBatchInput");
  await expect(picker).toBeFocused();
  await expect(picker).toBeInViewport({ratio:1});
  await expect(page.locator("#incomeSourceName")).toBeHidden();
  await page.locator(".retail-source-disclosure > summary").click();
  await expect(page.locator("#incomeSourceName")).toBeVisible();
  await page.keyboard.press("Escape");
  await restore(page,await backup(page));
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await tab(page,"Historia").click();
  const old = page.locator(".retail-payslip-superseded");
  const latest = page.locator(".history-row:not(.retail-payslip-superseded)").first();
  await expect(old).toHaveCount(1);
  await expect(old.locator(".retail-version-badge")).toHaveText("Korvattu versio – ei laskennassa");
  await expect(old.locator(".payslip-net")).toHaveCSS("text-decoration-line","line-through");
  await expect(latest.locator(".payslip-net")).toHaveCSS("text-decoration-line","none");
  await old.locator("summary.payslip-summary").click();
  await expect(old.locator(".payslip-detail")).toBeVisible();
  await expect(old.locator(".payslip-detail")).toContainText(/3\s*810,15/);
});

test("versioned backup, malformed restore, duplicate PDF and unfamiliar PDF", async ({ page }) => {
  await open(page);
  const payload = await backup(page);
  await restore(page, '{"records":');
  await expect(page.locator("#backupStatus")).toContainText("Palautus epäonnistui");
  await expect(page.locator("#recordCount")).toContainText("0 palkkalaskelmaa");
  await restore(page, payload);
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await expect(page.locator("#recordCount")).toContainText("9 palkkalaskelmaa");
  const download = page.waitForEvent("download");
  await page.locator("#exportButton").click();
  expect((await download).suggestedFilename()).toMatch(/^palkka-backup/);
  await page.reload();
  await ready(page);
  await expect(page.locator("#retailWelcome")).toBeHidden();
  const valid = makeTextPdf([
    "PALKKALASKELMA", "Palkkakausi 1.9.2026 - 15.9.2026", "Maksupäivä 28.9.2026",
    "Maksetaan 1 900,00", "KERTYMÄ PALKKAKAUDELTA", "Ennakonpid. al. tul 3 000,00",
    "Ennakonpidätys -800,00", "Maksetaan 1 900,00", "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 24 000,00", "Ennakonpidätys -6 400,00"
  ]);
  const upload = buffer => page.locator("#pdfInput").setInputFiles({name:"synthetic.pdf",mimeType:"application/pdf",buffer});
  await upload(valid);
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  await upload(valid);
  await expect(page.locator("#status")).toContainText("ilman tuplaa");
  await upload(makeTextPdf(["Synteettinen dokumentti", "Puutteellinen aineisto"]));
  await expect(page.locator("#unknownSection")).toBeVisible();
  const total = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()).length);
  expect(total).toBe(10);
});

test("closing the import sheet's page discards queued files but preserves committed payroll", async ({page, context}) => {
  await open(page);
  await restore(page, await backup(page));
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await tab(page, "Seuranta").click();
  await page.locator("#betaImportOpen").click();
  await page.locator("#betaBatchInput").setInputFiles({
    name:"queued-synthetic.pdf",mimeType:"application/pdf",
    buffer:makeTextPdf(["Synteettinen aineisto odottaa tallennusta"])
  });
  await expect(page.locator("#betaBatchFiles")).toContainText("queued-synthetic.pdf");
  await page.close();
  const next = await context.newPage();
  await open(next);
  const count = await next.evaluate(async () => (await (await import("/storage.js")).getAllRecords()).length);
  expect(count).toBe(9);
  await next.locator("#betaImportOpen").click();
  await expect(next.locator("#betaBatchFiles")).not.toContainText("queued-synthetic.pdf");
});

test("a Pages index redirect in the old cache is repaired by an ordinary PWA update, including offline", async ({ page, context }) => {
  const workerPath = "_pre-retail/sw.js", indexPath = "_pre-retail/index.html";
  const worker = await readFile(workerPath, "utf8"), index = await readFile(indexPath, "utf8");
  const config = JSON.parse(worker.split("\n")[0].slice("const CONFIG = ".length,-1));
  const legacyCache = "palkka-pre-retail-v-legacy-index";
  // Recreate the old request, cache key and fetch handler on a Pages-like server.
  const oldWorker = `const cacheName = ${JSON.stringify(legacyCache)};
    self.oninstall = e => e.waitUntil(caches.open(cacheName).then(c => c.addAll(
      ${JSON.stringify([...config.assets,"./experiments/year-planner/index.html"])})));
    self.onactivate = e => e.waitUntil(self.clients.claim());
    self.onfetch = e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));`;
  const snapshot = async current => {
    await current.evaluate(() => scrollTo(0,0));
    const image = await current.locator("#history").screenshot({animations:"disabled"});
    return createHash("sha256").update(image).digest("hex");
  };
  const rows = current => current.evaluate(async () => (await import("/storage.js")).getAllRecords());
  try {
    await writeFile(workerPath,oldWorker);
    await writeFile(indexPath,index.replace('src="./experiments/year-planner/"','src="./experiments/year-planner/index.html"'));
    await open(page);
    await restore(page, await backup(page));
    await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const saved = await rows(page);
    expect(saved).toHaveLength(9);
    await page.reload();
    await tab(page,"Laskuri").click();
    await expect.poll(() => page.frames().some(f => f.url().startsWith("chrome-error:"))).toBe(true);
    expect(await page.evaluate(async () => (await caches.match("/experiments/year-planner/index.html")).redirected)).toBe(true);
    await tab(page, "Historia").click();
    await expect(page.locator("#history")).toContainText(/2\s*897,30/);
    const before = await snapshot(page);
    await writeFile(indexPath,index);
    await writeFile(workerPath,worker);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
    expect(await page.evaluate(key => caches.has(key), legacyCache)).toBe(true);
    await page.close();
    const next = await context.newPage();
    await next.clock.setFixedTime(time);
    await next.goto("/");
    await expect.poll(() => next.evaluate(async () =>
      (await caches.keys()).filter(key => key.startsWith("palkka-pre-retail-v-"))
    )).toEqual(["palkka-pre-retail-v-" + config.revision]);
    await context.setOffline(true);
    await next.goto("/index.html");
    await expect(next).toHaveURL("http://127.0.0.1:4190/");
    await tab(next, "Historia").click();
    await expect(next.locator("#history")).toContainText(/2\s*897,30/);
    expect(await snapshot(next)).toBe(before);
    const frame = await planner(next);
    await expect(frame.locator("#historyPreview")).toBeVisible();
    expect(await rows(next)).toEqual(saved);
    const cached = await next.evaluate(async () => (await caches.match("/experiments/year-planner/")).redirected);
    expect(cached).toBe(false);
  } finally {
    await context.setOffline(false);
    await writeFile(indexPath,index);
    await writeFile(workerPath,worker);
  }
});

for (const width of [360, 390]) {
  test(`capture seven candidate views at ${width} px`, async ({ page }, info) => {
    await page.setViewportSize({width,height:860});
    await open(page);
    const directory = process.env.PRE_RETAIL_EVIDENCE_DIR ?? info.outputPath("screenshots");
    await mkdir(directory, {recursive:true});
    async function capture(name) {
      await page.evaluate(() => scrollTo(0, 0));
      const path = join(directory, `retail-${width}-${name}.png`);
      await page.screenshot({
        path, fullPage:true, animations:"disabled",
        // Move the dock to the end for a continuous image without obscured rows.
        style:"body{position:relative}.tabs{position:absolute!important;top:auto!important;bottom:0!important}"
      });
      await info.attach(name, {path,contentType:"image/png"});
    }
    await capture("01-seuranta-tyhja");
    await page.locator("#betaImportOpen").click();
    await expect(page.getByRole("dialog", {name:"Palkkalaskelmien tuonti"})).toBeVisible();
    const importPath = join(directory, `retail-${width}-02-tuonti.png`);
    await page.getByRole("dialog", {name:"Palkkalaskelmien tuonti"}).screenshot({
      path:importPath, animations:"disabled",
      style:"#betaImportWorkspace{position:absolute;inset:0 0 auto;max-height:none;height:auto;overflow:visible}"
    });
    await info.attach("Tuonti kokonaan", {path:importPath,contentType:"image/png"});
    await page.keyboard.press("Escape");
    await expect(page.locator("#betaImportOpen")).toBeFocused();
    await restore(page, await backup(page));
    await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
    await tab(page, "Seuranta").click();
    await capture("03-seuranta-historia");
    const frame = await planner(page);
    await expect.poll(() => frame.locator(".shell").evaluate(el => el.scrollHeight <= innerHeight)).toBe(true);
    await expect(frame.locator("#historyPreview")).toBeVisible();
    await capture("04-laskuri");
    if (width === 360) {
      for (const [name,selector] of [
        ["alku",null], ["historia","#historyPreview"], ["abc","#betaAnnualABSummary"],
        ["nettoero","h3:has(+ p + #netDifferenceChart)"], ["alimmat","#betaProgressTitle"]
      ]) {
        if (selector) {
          await frame.locator(selector).evaluate(node => {
            const top = window.frameElement.getBoundingClientRect().top + node.getBoundingClientRect().top;
            window.parent.scrollBy(0,top - 24);
          });
        }
        const path = join(directory,`retail-360-laskuri-${name}.png`);
        await page.screenshot({path,animations:"disabled",scale:"css"});
        await info.attach(name,{path,contentType:"image/png"});
      }
    }
    await frame.locator("#betaProgressChart").scrollIntoViewIfNeeded();
    const lower = join(directory,`retail-${width}-04-laskuri-kuvaajat.png`);
    await page.screenshot({path:lower,animations:"disabled"});
    await info.attach("Laskurin kuvaajat", {path:lower,contentType:"image/png"});
    await tab(page, "Analyysi").click();
    await page.getByRole("switch", {name:"Näytä A/B/C"}).click();
    await expect(page.locator("#salaryComparisonChart .salary-comparison-line")).toHaveCount(3);
    await capture("05-analyysi-koko");
    await page.locator(".salary-comparison-card").evaluate(node => window.scrollBy(0,node.getBoundingClientRect().top - 80));
    const path = join(directory, `retail-${width}-05-analyysi.png`);
    await page.screenshot({path,animations:"disabled"});
    await info.attach("Analyysin vertailukuvaaja", {path,contentType:"image/png"});
    await tab(page, "Historia").click();
    await capture("06-historia");
    await tab(page, "Asetukset").click();
    await capture("07-asetukset");
  });
}


test("batch import resumes automatically after resolving an ambiguous PDF", async ({page}) => {
  await page.setViewportSize({width:360,height:860});
  await open(page);
  await restore(page,await backup(page));
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await tab(page,"Seuranta").click();
  await page.locator("#betaImportOpen").click();
  await page.locator("#betaBatchSource").selectOption("paatyot");
  const pdf = (date,period,net,ytd) => makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi " + period,
    "Maksupäivä " + date,
    "Maksetaan " + net,
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul 3 000,00",
    "Ennakonpidätys -800,00",
    "Maksetaan " + net,
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul " + ytd,
    "Ennakonpidätys -6 400,00"
  ]);
  await page.locator("#betaBatchInput").setInputFiles([
    {name:"01-selkea.pdf",mimeType:"application/pdf",buffer:pdf("28.9.2026","1.9.2026 - 15.9.2026","1 900,00","24 000,00")},
    {name:"02-ristiriita.pdf",mimeType:"application/pdf",buffer:pdf("28.9.2026","1.9.2026 - 15.9.2026","1 850,00","23 950,00")},
    {name:"03-loppujono.pdf",mimeType:"application/pdf",buffer:pdf("28.10.2026","1.10.2026 - 15.10.2026","2 050,00","27 000,00")}
  ]);
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#betaBatchNext").click();
  await expect(page.locator("#conflictSection")).toBeVisible();
  await expect(page.locator("#betaBatchContinue")).toHaveCount(0);
  await expect(page.locator("#betaBatchFiles li").nth(2)).toContainText("Odottaa");
  // The existing "peru / ohita" decision resumes the rest of the queue.
  // No extra "continue" click is permitted or necessary.
  await page.locator("#cancelConflictButton").click();
  await expect(page.locator("#betaBatchFiles li").nth(1)).toContainText("Ohitettu");
  await expect(page.locator("#betaBatchFiles li").nth(2)).toContainText("Tallennettu");
  await expect(page.locator("#betaBatchStatus")).toContainText("tallennettu 2");
  const count = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()).length);
  expect(count).toBe(11);
});


test("planner iframe height is content-based and stable on mobile", async ({page}) => {
  await page.setViewportSize({width:360,height:860});
  await open(page);
  await tab(page,"Laskuri").click();
  const frame = page.frameLocator("#plannerFrame");
  await expect(frame.locator("#planYear")).toBeVisible();
  await expect(page.getByRole("link",{name:/erilliselle sivulle/i})).toHaveCount(0);
  const measure = () => page.locator("#plannerFrame").evaluate(iframe => {
    const content = iframe.contentDocument?.querySelector(".shell");
    return {
      actual: iframe.getBoundingClientRect().height,
      natural: content ? Math.ceil(content.getBoundingClientRect().bottom + iframe.contentDocument.defaultView.scrollY + 12) : 0
    };
  });
  await expect.poll(async () => {
    const {actual,natural} = await measure();
    return Math.abs(actual-natural);
  }, {timeout:15000}).toBeLessThan(9);
  const first = await measure();
  await page.waitForTimeout(1400);
  const last = await measure();
  expect(Math.abs(last.actual-first.actual)).toBeLessThan(24);
  expect(last.actual).toBeLessThan(20000);
});

test.describe("Android calculator", () => {
  const {userAgent,deviceScaleFactor,isMobile,hasTouch} = devices["Pixel 7"];
  test.use({userAgent,deviceScaleFactor,isMobile,hasTouch,viewport:{width:360,height:800}});
  test("cold start, controlled navigation, rotation and repeated visits retain one working planner", async ({page,context}, info) => {
    const errors = [], navigations = [], modules = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/experiments/year-planner/") && url.pathname.endsWith(".mjs")) {
        modules.push(url.pathname.split("/").pop());
      }
    });
    page.on("crash", () => errors.push("renderer crash"));
    page.on("pageerror", error => errors.push(error.message));
    page.on("requestfailed", request => errors.push(request.url() + " " + request.failure()?.errorText));
    page.on("response", response => { if (response.status() >= 400) errors.push(response.url()); });
    page.on("framenavigated", f => { if (f.parentFrame()) navigations.push(f.url()); });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
    await page.addInitScript(() => {
      window.longTasks = [];
      new PerformanceObserver(list => {
        window.longTasks.push(...list.getEntries().map(entry => Math.round(entry.duration)));
      }).observe({type:"longtask",buffered:true});
    });
    const start = performance.now();
    await page.goto("/",{waitUntil:"domcontentloaded"});
    await tab(page,"Laskuri").tap();
    const frame = page.frameLocator("#plannerFrame");
    await expect(frame.locator("#historyStatus")).toContainText("ei sisällä vielä vahvistettua palkkahistoriaa");
    await expect(frame.locator("#betaAnnualABSummary")).toBeVisible();
    const coldMs = Math.round(performance.now()-start);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    modules.length = 0;
    await page.reload();
    await tab(page,"Laskuri").tap();
    await frame.locator("#baseGross").fill("52000");
    await frame.locator("#weekendGross").fill("1000");
    await frame.locator("#betaWeekendsA").fill("2");
    await frame.locator("#betaWeekendsB").fill("10");
    // Same synthetic reference as the accepted Beta's summary-offline test.
    await expect(frame.locator("#betaABYearA")).toHaveText("32 400 €");
    await expect(frame.locator("#betaABYearB")).toHaveText("35 340 €");
    await frame.locator("#baseGross").fill("35000");
    await frame.locator("#betaCTarget").fill("3000");
    await expect(frame.locator("#betaCCount")).toHaveText("17 viikonloppua");
    await expect(frame.locator("#betaProgressTitle")).toContainText("2026");
    await expect(frame.locator("#betaProgressChart circle[data-series=C]")).toHaveCount(1);
    await expect(frame.locator("#netChart svg")).toHaveCount(1);

    const metrics = () => frame.locator(".shell").evaluate(shell => ({
      height:window.frameElement.offsetHeight, content:shell.offsetHeight,
      nodes:document.querySelectorAll("*").length, width:innerWidth,
      overflow:document.documentElement.scrollWidth-innerWidth
    }));
    await expect.poll(async () => Math.abs((await metrics()).height-(await metrics()).content)).toBeLessThan(22);
    const before = await metrics(), visits = [];
    const heapBefore = (await cdp.send("Runtime.getHeapUsage")).usedSize;
    for (const [width,height] of [[320,720],[390,844],[844,390],[430,900],[360,800]]) {
      await page.setViewportSize({width,height});
      await tab(page,"Seuranta").tap();
      await tab(page,"Laskuri").tap();
      await expect(frame.locator("#betaWeekendsB")).toHaveValue("10");
      for (const id of ["planYear","betaWeekendsA","betaCTarget","netDifferenceChart"]) {
        await frame.locator("#"+id).scrollIntoViewIfNeeded();
      }
      await expect(frame.locator("#netDifferenceChart svg")).toBeInViewport();
      await expect.poll(async () => (await metrics()).overflow).toBeLessThanOrEqual(1);
      visits.push(await metrics());
    }
    const after = await metrics();
    expect(after.nodes).toBe(before.nodes);
    expect(Math.abs(after.height-before.height)).toBeLessThan(8);
    expect(navigations).toEqual(Array(2).fill("http://127.0.0.1:4190/experiments/year-planner/"));
    expect(modules.sort()).toEqual(["ab-summary-model.mjs","ab-summary-v6.mjs","net-reference-2026.mjs","pre-retail-planner.mjs"]);
    const longTasks = await frame.locator(".shell").evaluate(() => window.longTasks);
    const report = {coldMs,cpuSlowdown:4,heapBefore,heapAfter:(await cdp.send("Runtime.getHeapUsage")).usedSize,
      maxLongTaskMs:Math.max(0,...longTasks),longTaskCount:longTasks.length,before,after,visits};
    console.log("PLANNER_MOBILE " + JSON.stringify(report));
    await info.attach("planner-mobile.json",{body:JSON.stringify(report,null,2),contentType:"application/json"});
    await frame.locator("#weekendMethod").selectOption("paylines");
    await expect(frame.locator("#validation")).toContainText("Vahvista ensin");
    await frame.locator("#hourlyRate").fill("24.51");
    await frame.locator("#ktaRate").fill("25.07");
    await frame.locator("#rulesConfirmed").check();
    await expect(frame.locator("#weekendBreakdown")).toContainText("1 094");
    await frame.locator("#rateA").fill("105");
    await expect(frame.locator("#betaABYearA")).toHaveText("–");
    await frame.locator("#rateA").fill("30");
    await frame.locator("#planYear").fill("2027");
    await expect(frame.locator("#betaProgressSummary")).toContainText("vuoden 2026 tasoa");
    await expect(frame.locator("#betaProgressChart svg")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
