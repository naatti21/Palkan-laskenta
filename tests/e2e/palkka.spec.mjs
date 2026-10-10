import { test, expect } from "@playwright/test";

test("@smoke mobiilin ydinpolku avautuu ilman vaakavieritystä", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.getByRole("heading", { name: "Palkka", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Seuranta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Historia" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Data" })).toBeVisible();
  await expect(page.getByText("Valitse palkkalaskelma PDF")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Data-välilehti kertoo paikallisen tallennuksen ja tietosuojan", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Data" }).click();

  await expect(page.getByRole("heading", { name: "Vain seurannan tarvitsema data" })).toBeVisible();
  await expect(page.getByText("IndexedDB", { exact: true })).toBeVisible();
  await expect(page.getByText(/0 palkkalaskelmaa paikallisesti/)).toBeVisible();
  await expect(page.getByText(/Alkuperäistä PDF-tiedostoa/)).toBeVisible();
});

test("Historia-välilehti toimii oikean navigaatiopolun kautta", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Historia" }).click();

  await expect(page.getByRole("heading", { name: "Tallennetut laskelmat" })).toBeVisible();
  await expect(page.getByText(/Ei tallennettuja laskelmia vuodelta/)).toBeVisible();
});

test("reload ei kadota paikallisen tietokannan käyttövalmiutta", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#status")).toContainText("Ei ladattua dokumenttia");
  await page.reload();
  await expect(page.locator("#status")).toContainText("Ei ladattua dokumenttia");
  await expect(page.locator("#recordCount")).toContainText("0 palkkalaskelmaa");
});


test("saman palkkatapahtuman ristiriita voidaan säilyttää erillisenä ilman hiljaista mergeä", async ({ page }) => {
  await page.goto("/index.html");

  const result = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    await storage.clearAllRecords();

    const make = (id, overrides = {}, fingerprint = id) => model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id,
      values: {
        payDate: "2026-08-28",
        payPeriodStart: "2026-08-03",
        payPeriodEnd: "2026-08-16",
        grossPay: 4698.11,
        netPay: 2678.39,
        ytdTaxableIncome: 63832.82,
        withholdingPeriod: -1526.89,
        ...overrides
      },
      fingerprints: [fingerprint],
      payLines: [],
      fieldMeta: {},
      corrections: {},
      notices: [],
      parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
    });

    const original = make("original", {}, "fp-original");
    await storage.upsertRecord(original);

    const changed = make("changed", { withholdingPeriod: -1500.00 }, "fp-changed");
    const conflict = model.findRecordConflict(await storage.getAllRecords(), changed);
    const separate = await storage.saveRecordSeparately(changed);
    const records = await storage.getAllRecords();

    return {
      conflictType: conflict?.type,
      differenceKeys: conflict?.differences?.map(item => item.key),
      count: records.length,
      separateId: separate.id,
      originalId: original.id
    };
  });

  expect(result.conflictType).toBe("same_event_conflict");
  expect(result.differenceKeys).toContain("withholdingPeriod");
  expect(result.count).toBe(2);
  expect(result.separateId).not.toBe(result.originalId);
});

test("korvaa aiempi -polku pitää yhden tietueen ja vaihtaa arvot", async ({ page }) => {
  await page.goto("/index.html");

  const result = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    await storage.clearAllRecords();

    const original = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "original",
      values: {
        payDate: "2026-08-28",
        payPeriodStart: "2026-08-03",
        payPeriodEnd: "2026-08-16",
        grossPay: 4698.11,
        netPay: 2678.39,
        ytdTaxableIncome: 63832.82,
        withholdingPeriod: -1526.89
      },
      fingerprints: ["fp-original"],
      payLines: [],
      fieldMeta: {},
      corrections: {},
      notices: [],
      parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
    });
    await storage.upsertRecord(original);

    const corrected = model.migrateLegacyRecord({
      ...original,
      id: "corrected",
      values: { ...original.values, netPay: 2728.39, withholdingPeriod: -1476.89 },
      fingerprints: ["fp-corrected"]
    });

    const replacement = await storage.replaceRecord(original.id, corrected);
    const records = await storage.getAllRecords();

    return {
      count: records.length,
      id: replacement.id,
      netPay: records[0].values.netPay,
      fingerprints: records[0].fingerprints
    };
  });

  expect(result.count).toBe(1);
  expect(result.id).toBe("original");
  expect(result.netPay).toBe(2728.39);
  expect(result.fingerprints).toEqual(["fp-corrected"]);
});
