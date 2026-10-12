import { test, expect } from "@playwright/test";

function makeColumnsPdf(order = ["period", "ytd", "previous"], options = {}) {
  // Synthetic payroll content. All values are invented and contain no identities.
  const definitions = {
    period: { header: "KERTYMÄ PALKKAKAUDELTA", taxable: "3 240,50", withholding: "-810,13" },
    ytd: { header: "KERTYMÄ VUODEN ALUSTA", taxable: "48 905,75", withholding: "-11 200,42" },
    previous: { header: "KERTYMÄ EDELLISELTÄ VUODELTA", taxable: "60 123,12", withholding: "-15 300,91" }
  };
  const positions = [25, 310, 590];
  const items = [
    [40, 790, "PALKKALASKELMA"],
    [40, 765, "Palkkakausi 3.8.2026 - 16.8.2026"],
    [40, 746, "Maksupäivä 28.8.2026"],
    [40, 727, "Maksetaan 2 300,12"],
    ...order.map((role, i) => [positions[i], 580, definitions[role].header]),
    ...order.filter(role => !(options.missingTaxableYtd && role === "ytd"))
      .map(role => [positions[order.indexOf(role)], 558, `Ennakonpid. al. tul ${definitions[role].taxable}`]),
    ...order.filter(role => !(options.missingWithholdingYtd && role === "ytd"))
      .map(role => [positions[order.indexOf(role)], 536, `Ennakonpidätys ${definitions[role].withholding}`]),
    ...(options.periodSectionTaxable
      ? [[40, 470, "Kauden tiedot"], [40, 447, `Ver.al.ans ${options.periodSectionTaxable}`]]
      : []),
    ...(options.yearSectionTaxable
      ? [[40, 411, "Vuoden tiedot"], [40, 388, `Ver.al.ans ${options.yearSectionTaxable}`]]
      : [])
  ];

  const escape = value => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = [
    "BT",
    "/F1 10 Tf",
    ...items.flatMap(([x, y, value]) => [
      `1 0 0 1 ${x} ${y} Tm`,
      `(${escape(value)}) Tj`
    ]),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
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
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("PDF.js kolmen rinnakkaisen kertymän PDF ei sekoita YTD- ja kauden arvoja", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name: "synthetic-parallel-columns.pdf",
    mimeType: "application/pdf",
    buffer: makeColumnsPdf()
  });

  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");

  const result = await page.evaluate(async () => {
    const { getAllRecords } = await import("/storage.js");
    const records = await getAllRecords();
    return records.map(item => ({
      gross: item.values.grossPay,
      ytd: item.values.ytdTaxableIncome,
      withholdingPeriod: item.values.withholdingPeriod,
      withholdingYtd: item.values.withholdingYtd
    }));
  });
  expect(result).toEqual([{
    gross: 3240.50,
    ytd: 48905.75,
    withholdingPeriod: -810.13,
    withholdingYtd: -11200.42
  }]);
});

test("QA F1: swapped PDF columns persist the correct gross and YTD values after reload", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name: "qa-reordered.pdf", mimeType: "application/pdf",
    buffer: makeColumnsPdf(["previous", "period", "ytd"])
  });
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  await page.reload();
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords())
    .map(item => item.values));
  expect(records).toHaveLength(1);
  expect(records[0].grossPay).toBe(3240.50);
  expect(records[0].ytdTaxableIncome).toBe(48905.75);
  expect(records[0].previousYearTaxableIncome).toBe(60123.12);
  expect(records[0].withholdingPeriod).toBe(-810.13);
  expect(records[0].withholdingYtd).toBe(-11200.42);
});

test("QA F5: incomplete withholding PDF requires review and never autosaves", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name: "qa-incomplete-withholding.pdf", mimeType: "application/pdf",
    buffer: makeColumnsPdf(["period", "ytd", "previous"], { missingWithholdingYtd: true })
  });
  await expect(page.locator("#status")).toContainText("tarvitsee tarkistuksen");
  await expect(page.locator("#reviewSection")).toBeVisible();
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(0);
});

test("QA F3: previous year value is editable in the review UI", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name: "qa-review-edit.pdf", mimeType: "application/pdf",
    buffer: makeColumnsPdf()
  });
  await expect(page.locator("#resultSection")).toBeVisible();
  await page.locator("#editParsedButton").click();
  await expect(page.locator('[data-key="previousYearTaxableIncome"]')).toBeVisible();
  await page.locator('[data-key="previousYearTaxableIncome"]').fill("60000,00");
  await page.locator("#saveButton").click();
  await expect(page.locator("#status")).toContainText(/Korjaus tallennettu|rakennehavainto päivitettiin/i);
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(1);
  expect(records[0].values.previousYearTaxableIncome).toBe(60000);
  expect(records[0].corrections.previousYearTaxableIncome.parserValue).toBe(60123.12);
});

test("QA RC-P0-01: conflicting period gross cannot autosave; both candidates visible; manual correction persists", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name: "qa-p0-conflicting-period-gross.pdf", mimeType: "application/pdf",
    buffer: makeColumnsPdf(["previous", "period", "ytd"], { periodSectionTaxable: "3 600,00" })
  });
  await expect(page.locator("#status")).toContainText("tarvitsee tarkistuksen");
  await expect(page.locator("#reviewSection")).toBeVisible();
  await expect(page.locator("#reviewGrid")).toContainText("3 240,50");
  await expect(page.locator("#reviewGrid")).toContainText("3 600,00");

  let records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(0);
  await page.reload();
  records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(0);

  // Only an explicit user decision in the review UI can create a record.
  await page.locator("#pdfInput").setInputFiles({
    name: "qa-p0-conflicting-period-gross.pdf", mimeType: "application/pdf",
    buffer: makeColumnsPdf(["previous", "period", "ytd"], { periodSectionTaxable: "3 600,00" })
  });
  await expect(page.locator("#reviewSection")).toBeVisible();
  await page.locator('[data-key="grossPay"]').fill("3240,50");
  await page.locator("#saveButton").click();
  await expect(page.locator("#status")).toContainText("Korjaus tallennettu");
  const saved = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(saved).toHaveLength(1);
  expect(saved[0].values.grossPay).toBe(3240.5);
  expect(saved[0].values.ytdTaxableIncome).toBe(48905.75);
  expect(saved[0].corrections.grossPay.parserValue).toBe(3600);
  await page.reload();
  const reloaded = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(reloaded[0].values.grossPay).toBe(3240.5);
});

test("QA RC-P0-01: conflicting YTD section and cumulative never autosave", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles({
    name: "qa-conflicting-ytd.pdf", mimeType: "application/pdf",
    buffer: makeColumnsPdf(["previous", "period", "ytd"], {
      periodSectionTaxable: "3 240,50",
      yearSectionTaxable: "49 905,75"
    })
  });
  await expect(page.locator("#status")).toContainText("tarvitsee tarkistuksen");
  await expect(page.locator('[data-key="ytdTaxableIncome"]')).toBeVisible();
  await expect(page.locator("#reviewGrid")).toContainText("49 905,75");
  await expect(page.locator("#reviewGrid")).toContainText("48 905,75");
  const records = await page.evaluate(async () => (await (await import("/storage.js")).getAllRecords()));
  expect(records).toHaveLength(0);
});
