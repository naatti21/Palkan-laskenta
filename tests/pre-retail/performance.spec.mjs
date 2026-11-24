import { test, expect } from "@playwright/test";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

async function bytes(path) {
  let sum = 0;
  for (const entry of await readdir(path, {withFileTypes:true})) {
    const file = join(path, entry.name);
    sum += entry.isDirectory() ? await bytes(file) : (await stat(file)).size;
  }
  return sum;
}

test("record mobile CPU-throttled startup and navigation with a 150-slip history", async ({page, context}, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.clock.setFixedTime(new Date("2026-12-22T12:00:00+02:00"));
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", {rate:4});
  const cold = performance.now();
  await page.goto("/");
  await expect(page.locator("#betaImportOpen")).toBeVisible();
  const emptyStartupMs = Math.round(performance.now() - cold);
  await session.send("Emulation.setCPUThrottlingRate", {rate:1});
  await page.evaluate(async () => {
    const { migrateLegacyRecord } = await import("/model.js");
    const { mergeManyRecords } = await import("/storage.js");
    const rows = Array.from({length:150}, (_, i) => migrateLegacyRecord({
      id:"perf-"+i, recordSchemaVersion:3,
      values:{
        payDate:new Date(Date.UTC(2021,0,4+i*14)).toISOString().slice(0,10),
        grossPay:3400+(i%7)*87.12, netPay:2500+(i%5)*62.17
      }
    }));
    await mergeManyRecords(rows);
  });
  await session.send("Emulation.setCPUThrottlingRate", {rate:4});
  const start = performance.now();
  await page.reload();
  await expect(page.locator(".compact-amount")).toContainText(/€/);
  await expect(page.locator("#betaImportOpen")).toBeVisible();
  const populatedStartupMs = Math.round(performance.now() - start);
  const click = performance.now();
  await page.getByRole("button",{name:"Historia",exact:true}).click();
  await expect(page.locator("#history .history-row").first()).toBeVisible();
  const historyNavigationMs = Math.round(performance.now() - click);
  const results = {cpuSlowdown:4, viewport:390, records:150, emptyStartupMs,
    populatedStartupMs, historyNavigationMs, bundleBytes:await bytes("_pre-retail")};
  console.log("PRE_RETAIL_PERF "+JSON.stringify(results));
  await info.attach("Pre-retail performance", {body:JSON.stringify(results,null,2),contentType:"application/json"});
});
