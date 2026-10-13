import {test, expect} from "@playwright/test";

// Synthetic-only: verify that a failed third step never leaves the first two committed.
async function syntheticBackup(page) {
  return page.evaluate(async () => {
    const model = await import("/model.js");
    const record = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "qa-atomic-payslip",
      kind: "payslip",
      values: {
        payDate: "2026-10-09",
        payPeriodStart: "2026-09-15",
        payPeriodEnd: "2026-09-28",
        grossPay: 3200,
        netPay: 1900,
        ytdTaxableIncome: 13200
      },
      payLines: [],
      fingerprints: ["qa-synthetic-atomic-restore"],
      fieldMeta: {}, corrections: {}, notices: [],
      parser: {version: "qa-test", confidence: 1, documentType: "payslip", sourceProfile: "qa"}
    });
    const bankSnapshots = [{
      id: "bank-qa-atomic",
      asOfDate: "2026-10-12",
      balanceMinutes: 2955,
      source: "time-system",
      note: "synthetic",
      recordedAt: "2026-10-12T12:00:00.000Z",
      corrections: []
    }];
    const learnedProfiles = [{
      id: "qa-atomic-layout",
      signals: ["title:palkkalaskelma", "label:palkkakausi", "label:maksupaiva"],
      observations: 3, confirmations: 2, autoParses: 1,
      mappings: [],
      sourceProfile: "synthetic",
      firstSeenAt: "2026-10-01T12:00:00.000Z",
      lastSeenAt: "2026-10-12T12:00:00.000Z"
    }];
    return model.makeBackup([record], {bankSnapshots, learnedProfiles});
  });
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const s = await import("/storage.js");
    return {
      payslips: (await s.getAllRecords()).map(x => x.id).sort(),
      bank: await s.getSetting("worktimeBankAnchors:v1"),
      learned: await s.getSetting("learnedLayoutProfiles:v1")
    };
  });
}
async function upload(page, backup) {
  await page.locator("#backupInput").setInputFiles({
    name: "qa-synthetic-atomic-restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });
}

test("QA RED: learned-profile write failure rolls back bank and payslip together", async ({page}) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name: "Data"}).click();
  const backup = await syntheticBackup(page);
  const before = await snapshot(page);
  expect(before).toEqual({payslips: [], bank: null, learned: null});
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === "settings" && value?.key === "learnedLayoutProfiles:v1")
        throw new DOMException("QA learned settings write failure", "QuotaExceededError");
      return original.call(this, value, ...args);
    };
    window.__restorePut = () => {IDBObjectStore.prototype.put = original;};
  });
  await upload(page, backup);
  await expect(page.locator("#backupStatus")).toContainText("Palautus epäonnistui");
  await page.evaluate(() => window.__restorePut());
  expect(await snapshot(page)).toEqual(before);
  await page.reload();
  expect(await snapshot(page)).toEqual(before);
});

test("successful backup restore commits all stores and repeat does not duplicate", async ({page}) => {
  await page.goto("/index.html");
  await page.getByRole("button", {name: "Data"}).click();
  const backup = await syntheticBackup(page);
  await upload(page, backup);
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  const after = await snapshot(page);
  expect(after.payslips).toEqual(["qa-atomic-payslip"]);
  expect(after.bank).toHaveLength(1);
  expect(after.bank[0].balanceMinutes).toBe(2955);
  expect(after.learned).toHaveLength(1);
  expect(after.learned[0].confirmations).toBe(2);
  await page.reload();
  await page.getByRole("button", {name: "Data"}).click();
  expect(await snapshot(page)).toEqual(after);
  await upload(page, backup);
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  expect(await snapshot(page)).toEqual(after);
});
