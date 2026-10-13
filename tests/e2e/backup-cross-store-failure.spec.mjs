import { test, expect } from "@playwright/test";

// Synthetic-only failure injection: one IndexedDB settings write fails *after*
// the payslip-store transaction has succeeded. This must not partially restore.
test("QA RED: bank store write failure must roll back payslip restore", async ({page}) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name: "Data"}).click();

  const backup = await page.evaluate(async () => {
    const model = await import("/model.js");
    const record = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "qa-cross-store-new-payslip",
      kind: "payslip",
      values: {
        payDate: "2026-10-09",
        payPeriodStart: "2026-09-15",
        payPeriodEnd: "2026-09-28",
        grossPay: 3200,
        netPay: 1920,
        ytdTaxableIncome: 13200
      },
      payLines: [],
      fingerprints: ["qa-synthetic-cross-store-new-payslip"],
      fieldMeta: {},
      corrections: {},
      notices: [],
      parser: {
        version: "qa-test",
        confidence: 1,
        documentType: "payslip",
        sourceProfile: "qa-test"
      }
    });
    const anchor = {
      id: "bank-qa-cross-store",
      asOfDate: "2026-10-12",
      balanceMinutes: 2955,
      source: "time-system",
      note: "synthetic",
      recordedAt: "2026-10-12T12:00:00.000Z",
      corrections: []
    };
    return model.makeBackup([record], {bankSnapshots: [anchor]});
  });

  const state = () => page.evaluate(async () => {
    const storage = await import("/storage.js");
    return {
      payslips: (await storage.getAllRecords()).map(record => record.id).sort(),
      bank: await storage.getSetting("worktimeBankAnchors:v1")
    };
  });
  const before = await state();
  expect(before.payslips).toEqual([]);
  expect(before.bank).toBeNull();

  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...rest) {
      if (this.name === "settings" && value?.key === "worktimeBankAnchors:v1") {
        throw new DOMException("Synthetic bank-store write failure", "QuotaExceededError");
      }
      return originalPut.call(this, value, ...rest);
    };
    window.__qaRestorePut = () => {
      IDBObjectStore.prototype.put = originalPut;
      delete window.__qaRestorePut;
    };
  });

  await page.locator("#backupInput").setInputFiles({
    name: "qa-cross-store-failure.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });
  await expect(page.locator("#backupStatus")).toContainText("Palautus epäonnistui");

  await page.evaluate(() => window.__qaRestorePut());
  const after = await state();

  // This invariant currently fails because mergeManyRecords commits before
  // the bank setting is written in a separate transaction.
  expect(after).toEqual(before);
});
