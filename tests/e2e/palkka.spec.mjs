import { test, expect } from "@playwright/test";

function makeTextPdf(lines) {
  const escapePdf = value => String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

  const content = [
    "BT",
    "/F1 10 Tf",
    "50 790 Td",
    "14 TL",
    ...lines.flatMap((line, index) => [
      `(${escapePdf(line)}) Tj`,
      ...(index < lines.length - 1 ? ["T*"] : [])
    ]),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}


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


test("Data-välilehti näyttää tunnistetut rakenteet ja opitut kentät", async ({ page }) => {
  await page.goto("/index.html");

  await page.evaluate(async () => {
    const storage = await import("/storage.js");
    await storage.setSetting("learnedLayoutProfiles:v1", [{
      id: "test-layout",
      signals: ["title:palkkalaskelma", "label:palkkakausi", "label:maksupaiva"],
      observations: 3,
      confirmations: 1,
      autoParses: 2,
      mappings: [{
        field: "grossPay",
        selectors: ["a".repeat(64)],
        confirmations: 1,
        learnedAt: "2026-10-10T00:00:00.000Z"
      }],
      sourceProfile: "generic-text-pdf"
    }]);
  });

  await page.reload();
  await page.getByRole("button", { name: "Data" }).click();
  await expect(page.locator("#learnedProfileCount")).toHaveText("1 rakennetta · 3 havaintoa · 1 opittua kenttää");
});


test("QA-01: backup-palautus säilyttää erillisiksi hyväksytyt ristiriitaversiot", async ({ page }) => {
  await page.goto("/index.html");

  const backup = {
    app: "Palkka PWA",
    backupSchemaVersion: 2,
    recordSchemaVersion: 1,
    records: [
      {
        recordSchemaVersion: 1,
        id: "qa-original",
        values: {
          payDate: "2026-08-28",
          payPeriodStart: "2026-08-03",
          payPeriodEnd: "2026-08-16",
          grossPay: 4698.11,
          netPay: 2678.39,
          ytdTaxableIncome: 63832.82,
          withholdingPeriod: -1526.89
        },
        fingerprints: ["qa-fp-original"],
        payLines: [],
        fieldMeta: {},
        corrections: {},
        notices: [],
        parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
      },
      {
        recordSchemaVersion: 1,
        id: "qa-kept-variant",
        values: {
          payDate: "2026-08-28",
          payPeriodStart: "2026-08-03",
          payPeriodEnd: "2026-08-16",
          grossPay: 4698.11,
          netPay: 2678.39,
          ytdTaxableIncome: 63832.82,
          withholdingPeriod: -1500.00
        },
        fingerprints: ["qa-fp-changed"],
        payLines: [],
        fieldMeta: {},
        corrections: {},
        notices: [],
        parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
      }
    ],
    learnedProfiles: []
  };

  await page.evaluate(async () => {
    const storage = await import("/storage.js");
    await storage.clearAllRecords();
  });

  await page.getByRole("button", { name: "Data" }).click();
  await page.locator("#backupInput").setInputFiles({
    name: "qa-conflict-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  });

  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");

  const records = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return await storage.getAllRecords();
  });

  expect(records).toHaveLength(2);
  expect(records.map(r => r.values.withholdingPeriod).sort((a, b) => a - b))
    .toEqual([-1526.89, -1500.00]);
  expect(new Set(records.map(r => r.id)).size).toBe(2);
});


test("R2-01: fingerprintittömän konfliktibackupin toinen palautus säilyttää molemmat arvot", async ({ page }) => {
  await page.goto("/index.html");

  const backup = {
    app: "Palkka PWA",
    backupSchemaVersion: 2,
    recordSchemaVersion: 1,
    learnedProfiles: [],
    records: [
      {
        recordSchemaVersion: 1,
        id: "qa-r2-no-fp-A",
        values: {
          payDate: "2026-03-27",
          payPeriodStart: "2026-03-02",
          payPeriodEnd: "2026-03-15",
          grossPay: 3000,
          netPay: 1900,
          ytdTaxableIncome: 18000,
          withholdingPeriod: -800
        },
        fingerprints: [],
        payLines: [],
        fieldMeta: {},
        corrections: {},
        notices: [],
        parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
      },
      {
        recordSchemaVersion: 1,
        id: "qa-r2-no-fp-B",
        values: {
          payDate: "2026-03-27",
          payPeriodStart: "2026-03-02",
          payPeriodEnd: "2026-03-15",
          grossPay: 3000,
          netPay: 1900,
          ytdTaxableIncome: 18000,
          withholdingPeriod: -750
        },
        fingerprints: [],
        payLines: [],
        fieldMeta: {},
        corrections: {},
        notices: [],
        parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
      }
    ]
  };

  await page.evaluate(async () => {
    const storage = await import("/storage.js");
    await storage.clearAllRecords();
  });

  await page.getByRole("button", { name: "Data" }).click();
  const input = page.locator("#backupInput");
  const file = {
    name: "r2-no-fingerprints.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup))
  };
  await input.setInputFiles(file);
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");
  await input.setInputFiles(file);
  await expect(page.locator("#backupStatus")).toContainText("Palautus valmis");

  const values = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return (await storage.getAllRecords())
      .filter(r => ["qa-r2-no-fp-A", "qa-r2-no-fp-B"].includes(r.id))
      .map(r => [r.id, r.values.withholdingPeriod])
      .sort((a, b) => a[0].localeCompare(b[0]));
  });

  expect(values).toEqual([
    ["qa-r2-no-fp-A", -800],
    ["qa-r2-no-fp-B", -750]
  ]);
});

test("R2-02: toinen käyttäjäkorjaus voittaa ensimmäisen mutta parseriarvo säilyy", async ({ page }) => {
  await page.goto("/index.html");

  const result = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    await storage.clearAllRecords();

    const original = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "qa-r2-correction",
      values: {
        payDate: "2024-02-29",
        payPeriodStart: "2024-02-15",
        payPeriodEnd: "2024-02-28",
        grossPay: 4698.11,
        netPay: 2678.39,
        ytdTaxableIncome: 63832.82
      },
      fingerprints: ["qa-r2-correction-fp"],
      payLines: [],
      fieldMeta: {},
      corrections: {},
      notices: [],
      parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" }
    });

    const first = model.applyUserCorrections(original, { netPay: 2400 });
    await storage.upsertRecord(first);
    const storedFirst = (await storage.getAllRecords())[0];
    const second = model.applyUserCorrections(storedFirst, { netPay: 2500 });
    await storage.upsertRecord(second);
    const storedSecond = (await storage.getAllRecords())[0];

    return {
      netPay: storedSecond.values.netPay,
      parserValue: storedSecond.corrections.netPay?.parserValue,
      userValue: storedSecond.corrections.netPay?.userValue
    };
  });

  expect(result.netPay).toBe(2500);
  expect(result.parserValue).toBe(2678.39);
  expect(result.userValue).toBe(2500);
});


test("oikea PDF-upload toimii ilman ulkoista PDF.js-verkkoa", async ({ page }) => {
  const externalPdfRuntime = [];
  page.on("request", request => {
    if (/cdnjs\.cloudflare\.com|unpkg\.com|jsdelivr\.net/i.test(request.url())) externalPdfRuntime.push(request.url());
  });
  await page.route("https://**/*", route => route.abort());
  await page.goto("/index.html");

  const pdf = makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi 3.8.2026 - 16.8.2026",
    "Maksupäivä 28.8.2026",
    "Maksetaan 2 678,39",
    "KTA 25,07",
    "PP 19,44",
    "Prosentti1 32,5% Tuloraja 40 000,00",
    "Prosentti2 47,0%",
    "20040 Ylityö 100 % vrk 4,15 25,07 104,04",
    "20050 Ylityö 50 % vko 7,90 25,07 99,03",
    "20060 Ylityö 100 % vko 8,00 25,07 200,56",
    "90000 Ennakonpidätys 8 028,58 -1 526,89",
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul 4 698,11",
    "Ennakonpidätys -1 526,89",
    "Maksetaan 2 678,39",
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 63 832,82",
    "Ennakonpidätys -18 792,51"
  ]);

  await page.locator("#pdfInput").setInputFiles({
    name: "anonymisoitu-tunnistus.pdf",
    mimeType: "application/pdf",
    buffer: pdf
  });

  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  await expect(page.locator("#resultSection")).toBeVisible();
  await expect(page.locator("#resultSummary")).toContainText("4 698,11");
  await expect(page.locator("#resultSummary")).toContainText("2 678,39");
  await expect(page.locator("#resultSummary")).toContainText("63 832,82");

  const records = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return await storage.getAllRecords();
  });

  expect(records).toHaveLength(1);
  expect(records[0].values.grossPay).toBe(4698.11);
  expect(records[0].values.netPay).toBe(2678.39);
  expect(records[0].values.ytdTaxableIncome).toBe(63832.82);
  expect(externalPdfRuntime).toEqual([]);
});


function backupRecord(id, withholdingPeriod, overrides = {}) {
  return {
    recordSchemaVersion: 1,
    id,
    kind: "payslip",
    values: {
      payPeriodStart: "2026-03-02",
      payPeriodEnd: "2026-03-15",
      payDate: "2026-03-27",
      grossPay: 3000,
      netPay: 1900,
      ytdTaxableIncome: 18000,
      withholdingPeriod,
      withholdingYtd: null,
      ...overrides
    },
    fingerprints: [],
    payLines: [],
    fieldMeta: {},
    corrections: {},
    notices: [],
    parser: { version: "test", confidence: 1, documentType: "payslip", sourceProfile: "test" },
    createdAt: "2026-10-11T04:52:12.705Z",
    updatedAt: "2026-10-11T04:52:12.705Z"
  };
}

function backupPayload(records) {
  return {
    app: "Palkka PWA",
    backupSchemaVersion: 2,
    recordSchemaVersion: 1,
    exportedAt: "2026-10-11T04:52:12.706Z",
    learnedProfiles: [],
    records
  };
}

test("R3-01: legacy-migraatio säilyttää saman tapahtuman ristiriitaversiot ennen lähteen poistoa", async ({ page }) => {
  const legacy = [
    {
      payDate: "2026-03-27",
      payPeriodStart: "2026-03-02",
      payPeriodEnd: "2026-03-15",
      grossPay: 3000,
      netPay: 1900,
      ytdTaxableIncome: 18000,
      withholdingPeriod: -800,
      savedAt: "2026-03-27T10:00:00.000Z"
    },
    {
      payDate: "2026-03-27",
      payPeriodStart: "2026-03-02",
      payPeriodEnd: "2026-03-15",
      grossPay: 3000,
      netPay: 1900,
      ytdTaxableIncome: 18000,
      withholdingPeriod: -750,
      savedAt: "2026-03-28T10:00:00.000Z"
    }
  ];

  await page.addInitScript(records => {
    localStorage.setItem("palkka-pwa-proto:v1", JSON.stringify(records));
  }, legacy);
  await page.goto("/index.html");
  await expect(page.locator("#status")).toContainText("siirrettiin uuteen tietokantaan");

  const result = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const records = await storage.getAllRecords();
    return {
      values: records.map(r => r.values.withholdingPeriod).sort((a,b) => a-b),
      source: localStorage.getItem("palkka-pwa-proto:v1")
    };
  });

  expect(result.values).toEqual([-800, -750]);
  expect(result.source).toBeNull();
});

test("R3-02: saman jo säilytetyn konfliktiversion uusi Säilytä molemmat ei tee kopiota", async ({ page }) => {
  await page.goto("/index.html");
  const basePdf = makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi 3.8.2026 - 16.8.2026",
    "Maksupäivä 28.8.2026",
    "Maksetaan 2 678,39",
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul 4 698,11",
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 63 832,82"
  ]);

  const upload = async () => page.locator("#pdfInput").setInputFiles({
    name: "same-version.pdf",
    mimeType: "application/pdf",
    buffer: basePdf
  });

  await upload();
  await expect(page.locator("#resultSection")).toBeVisible();
  await page.locator("#editParsedButton").click();
  await page.locator('#reviewGrid input[data-key="netPay"]').fill("2700");
  await page.locator("#saveButton").click();
  await expect(page.locator("#resultSection")).toBeVisible();

  await upload();
  await expect(page.locator("#conflictSection")).toBeVisible();
  await page.locator("#keepBothConflictButton").click();

  await upload();
  await expect(page.locator("#conflictSection")).toBeVisible();
  await page.locator("#keepBothConflictButton").click();

  const records = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return await storage.getAllRecords();
  });
  expect(records).toHaveLength(2);
  expect(records.map(r => r.values.netPay).sort((a,b)=>a-b)).toEqual([2678.39, 2700]);
});

test("R3-03: sama saman-id:n konfliktibackup kahdesti lisää variantin vain kerran", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Data" }).click();
  const input = page.locator("#backupInput");

  const initial = backupPayload([
    backupRecord("qa-A", -800),
    backupRecord("qa-B", -750)
  ]);
  const changed = backupPayload([
    backupRecord("qa-A", -700)
  ]);

  const setBackup = async (name, payload) => input.setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload))
  });

  await setBackup("initial.json", initial);
  await setBackup("changed.json", changed);
  await setBackup("changed-again.json", changed);

  const values = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return (await storage.getAllRecords()).map(r => r.values.withholdingPeriod).sort((a,b)=>a-b);
  });
  expect(values).toEqual([-800, -750, -700]);
});

test("R3-05: restore on atominen jos toinen IndexedDB-kirjoitus epäonnistuu", async ({ page }) => {
  await page.goto("/index.html");

  const result = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    await storage.clearAllRecords();

    const a = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "atomic-A",
      values: {
        payPeriodStart: "2026-03-02", payPeriodEnd: "2026-03-15", payDate: "2026-03-27",
        grossPay: 3000, netPay: 1900, ytdTaxableIncome: 18000, withholdingPeriod: -800
      },
      fingerprints: [], payLines: [], fieldMeta: {}, corrections: {}, notices: []
    });
    const b = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "atomic-B",
      values: {
        payPeriodStart: "2026-04-01", payPeriodEnd: "2026-04-15", payDate: "2026-04-27",
        grossPay: 3100, netPay: 1950, ytdTaxableIncome: 21100, withholdingPeriod: -820
      },
      fingerprints: [], payLines: [], fieldMeta: {}, corrections: {}, notices: []
    });
    await storage.mergeManyRecords([a,b]);
    const before = JSON.stringify(await storage.getAllRecords());

    const updateA = model.migrateLegacyRecord({
      ...a,
      values: { ...a.values, withholdingYtd: -1000 }
    });
    const c = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "atomic-C",
      values: {
        payPeriodStart: "2026-05-01", payPeriodEnd: "2026-05-15", payDate: "2026-05-27",
        grossPay: 3200, netPay: 2000, ytdTaxableIncome: 24300, withholdingPeriod: -830
      },
      fingerprints: [], payLines: [], fieldMeta: {}, corrections: {}, notices: []
    });

    const originalPut = IDBObjectStore.prototype.put;
    let puts = 0;
    IDBObjectStore.prototype.put = function(...args) {
      puts += 1;
      if (puts === 2) throw new DOMException("QA quota failure", "QuotaExceededError");
      return originalPut.apply(this, args);
    };

    let errorName = null;
    try {
      await storage.mergeManyRecords([updateA, c]);
    } catch (err) {
      errorName = err?.name || "Error";
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    const after = JSON.stringify(await storage.getAllRecords());
    return { before, after, errorName };
  });

  expect(result.errorName).toBe("QuotaExceededError");
  expect(result.after).toBe(result.before);
});

test("R3-06: identtinen restore ei muuta updatedAt-metaa", async ({ page }) => {
  await page.goto("/index.html");
  const result = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    const model = await import("/model.js");
    await storage.clearAllRecords();

    const record = model.migrateLegacyRecord({
      recordSchemaVersion: 1,
      id: "no-op",
      createdAt: "2026-10-10T10:00:00.000Z",
      updatedAt: "2026-10-10T10:00:00.000Z",
      values: {
        payPeriodStart: "2026-03-02", payPeriodEnd: "2026-03-15", payDate: "2026-03-27",
        grossPay: 3000, netPay: 1900, ytdTaxableIncome: 18000, withholdingPeriod: -800
      },
      fingerprints: [], payLines: [], fieldMeta: {}, corrections: {}, notices: []
    });

    await storage.mergeManyRecords([record]);
    const first = (await storage.getAllRecords())[0];
    await new Promise(resolve => setTimeout(resolve, 10));
    await storage.mergeManyRecords([record]);
    const second = (await storage.getAllRecords())[0];
    return { first: first.updatedAt, second: second.updatedAt };
  });
  expect(result.second).toBe(result.first);
});

test("R3-07: käänteistä palkkakautta ei voi hyväksyä Tallenna-painikkeella muuttamatta", async ({ page }) => {
  await page.goto("/index.html");
  const pdf = makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi 16.8.2026 - 3.8.2026",
    "Maksupäivä 28.8.2026",
    "Maksetaan 2 678,39",
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpid. al. tul 4 698,11",
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 63 832,82"
  ]);

  await page.locator("#pdfInput").setInputFiles({
    name: "reversed-period.pdf",
    mimeType: "application/pdf",
    buffer: pdf
  });
  await expect(page.locator("#reviewSection")).toBeVisible();
  await page.locator("#saveButton").click();
  await expect(page.locator("#reviewSection")).toBeVisible();
  await expect(page.locator("#status")).toContainText(/loppupäivä|korjaa|tarkista/i);

  const count = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return (await storage.getAllRecords()).length;
  });
  expect(count).toBe(0);
});


test("oppimisen roundtrip: uusi rakenne esitäyttyy, mutta ilman lähdeevidenssiä hyväksyntä pysyy käsin tehtävänä", async ({ page }) => {
  await page.goto("/index.html");

  const firstPdf = makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi 1.9.2026 - 14.9.2026",
    "Maksupäivä 25.9.2026",
    "Maksetaan 2 100,00",
    "KAUDEN TIEDOT",
    "Ansio X 3 500,00",
    "VUODEN TIEDOT",
    "Kertymä X 70 000,00"
  ]);

  await page.locator("#pdfInput").setInputFiles({
    name: "learn-first.pdf",
    mimeType: "application/pdf",
    buffer: firstPdf
  });

  await expect(page.locator("#reviewSection")).toBeVisible();
  await expect(page.locator('#reviewGrid input[data-key="grossPay"]')).toBeVisible();
  await expect(page.locator('#reviewGrid input[data-key="ytdTaxableIncome"]')).toBeVisible();

  await page.locator('#reviewGrid input[data-key="grossPay"]').fill("3500");
  await page.locator('#reviewGrid input[data-key="ytdTaxableIncome"]').fill("70000");
  await page.locator("#saveButton").click();

  await expect(page.locator("#resultSection")).toBeVisible();
  await expect(page.locator("#status")).toContainText(/rakennehavainto päivitettiin|Korjaus tallennettu/i);

  const profile = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return await storage.getSetting("learnedLayoutProfiles:v1");
  });
  expect(Array.isArray(profile)).toBe(true);
  expect(profile.length).toBeGreaterThan(0);
  expect(profile.some(item => (item.mappings || []).some(mapping => mapping.field === "grossPay"))).toBe(true);
  expect(profile.some(item => (item.mappings || []).some(mapping => mapping.field === "ytdTaxableIncome"))).toBe(true);

  const secondPdf = makeTextPdf([
    "PALKKALASKELMA",
    "Palkkakausi 15.9.2026 - 28.9.2026",
    "Maksupäivä 9.10.2026",
    "Maksetaan 2 250,00",
    "KAUDEN TIEDOT",
    "Ansio X 3 750,00",
    "VUODEN TIEDOT",
    "Kertymä X 73 750,00"
  ]);

  await page.locator("#pdfInput").setInputFiles({
    name: "learn-second.pdf",
    mimeType: "application/pdf",
    buffer: secondPdf
  });

  // Security behavior change: trained mappings can prefill amounts but may
  // not turn an otherwise unverified salary amount into an automatic approval.
  await expect(page.locator("#status")).toContainText("tarvitsee tarkistuksen");
  await expect(page.locator("#reviewSection")).toBeVisible();
  await expect(page.locator('#reviewGrid input[data-key="grossPay"]')).toHaveValue("3750");
  await expect(page.locator('#reviewGrid input[data-key="ytdTaxableIncome"]')).toHaveValue("73750");
  await page.locator("#saveButton").click();
  await expect(page.locator("#status")).toContainText("Korjaus tallennettu");

  const records = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return (await storage.getAllRecords()).map(record => record.values).sort((a,b) =>
      String(a.payDate).localeCompare(String(b.payDate))
    );
  });

  expect(records).toHaveLength(2);
  expect(records[1].grossPay).toBe(3750);
  expect(records[1].netPay).toBe(2250);
  expect(records[1].ytdTaxableIncome).toBe(73750);
});

for (const width of [360, 412]) {
  test(`mobiili ${width}px kestää pitkän PDF-tuloksen ilman vaakavieritystä`, async ({ page }) => {
    await page.setViewportSize({ width, height: 915 });
    await page.goto("/index.html");

    const longLines = Array.from({ length: 45 }, (_, index) =>
      `${31000 + index} Tuntematon erittäin pitkä palkkalajin nimi numero ${index + 1} 1,00 10,00 10,00`
    );

    const pdf = makeTextPdf([
      "PALKKALASKELMA",
      "Palkkakausi 1.10.2026 - 14.10.2026",
      "Maksupäivä 23.10.2026",
      "Maksetaan 2 678,39",
      ...longLines,
      "KERTYMÄ PALKKAKAUDELTA",
      "Ennakonpid. al. tul 4 698,11",
      "KERTYMÄ VUODEN ALUSTA",
      "Ennakonpid. al. tul 78 448,11"
    ]);

    await page.locator("#pdfInput").setInputFiles({
      name: `mobile-long-${width}.pdf`,
      mimeType: "application/pdf",
      buffer: pdf
    });

    await expect(page.locator("#resultSection")).toBeVisible();
    await page.getByRole("button", { name: "Historia" }).click();
    await expect(page.getByRole("heading", { name: "Tallennetut laskelmat" })).toBeVisible();

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Data" }).click();
    const dataOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(dataOverflow).toBeLessThanOrEqual(1);
  });
}
