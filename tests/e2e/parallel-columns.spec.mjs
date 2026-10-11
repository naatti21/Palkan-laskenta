import { test, expect } from "@playwright/test";

function makeColumnsPdf() {
  // Synthetic payroll content. All values are invented and contain no identities.
  const items = [
    [40, 790, "PALKKALASKELMA"],
    [40, 765, "Palkkakausi 3.8.2026 - 16.8.2026"],
    [40, 746, "Maksupäivä 28.8.2026"],
    [40, 727, "Maksetaan 2 300,12"],
    [25, 580, "KERTYMÄ PALKKAKAUDELTA"],
    [310, 580, "KERTYMÄ VUODEN ALUSTA"],
    [590, 580, "KERTYMÄ EDELLISELTÄ VUODELTA"],
    [25, 558, "Ennakonpid. al. tul 3 240,50"],
    [310, 558, "Ennakonpid. al. tul 48 905,75"],
    [590, 558, "Ennakonpid. al. tul 60 123,12"],
    [25, 536, "Ennakonpidätys -810,13"],
    [310, 536, "Ennakonpidätys -11 200,42"],
    [590, 536, "Ennakonpidätys -15 300,91"]
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
