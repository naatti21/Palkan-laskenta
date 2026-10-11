import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

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

async function waitForServiceWorkerControl(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload();
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

function payslipPdf({ start, end, payDate, net, gross, ytd }) {
  return makeTextPdf([
    "PALKKALASKELMA",
    `Palkkakausi ${start} - ${end}`,
    `Maksupäivä ${payDate}`,
    `Maksetaan ${net}`,
    "KERTYMÄ PALKKAKAUDELTA",
    `Ennakonpid. al. tul ${gross}`,
    "KERTYMÄ VUODEN ALUSTA",
    `Ennakonpid. al. tul ${ytd}`
  ]);
}

test("service worker cache sisältää sovelluksen ja paikallisen PDF.js-runtimen", async ({ page }) => {
  await page.goto("/index.html");
  await waitForServiceWorkerControl(page);

  const state = await page.evaluate(async () => {
    const names = await caches.keys();
    const cacheName = names.find(name => name.startsWith("palkka-pwa-v"));
    const cache = cacheName ? await caches.open(cacheName) : null;
    const urls = cache ? (await cache.keys()).map(request => new URL(request.url).pathname) : [];
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      cacheName,
      urls
    };
  });

  expect(state.controlled).toBe(true);
  expect(state.cacheName).toBe("palkka-pwa-v13");
  expect(state.urls).toContain("/index.html");
  expect(state.urls).toContain("/vendor/pdfjs/pdf.min.mjs");
  expect(state.urls).toContain("/vendor/pdfjs/pdf.worker.min.mjs");
});

test("offline reload säilyttää historian ja uusi PDF tunnistuu ilman verkkoa", async ({ page, context }) => {
  await page.goto("/index.html");
  await waitForServiceWorkerControl(page);

  const first = payslipPdf({
    start: "1.11.2026",
    end: "14.11.2026",
    payDate: "27.11.2026",
    net: "2 100,00",
    gross: "3 500,00",
    ytd: "81 948,11"
  });

  await page.locator("#pdfInput").setInputFiles({
    name: "online-prime.pdf",
    mimeType: "application/pdf",
    buffer: first
  });
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Palkka", exact: true })).toBeVisible();
  await expect(page.locator("#recordCount")).toContainText("1 palkkalaskelmaa");

  const second = payslipPdf({
    start: "15.11.2026",
    end: "28.11.2026",
    payDate: "11.12.2026",
    net: "2 250,00",
    gross: "3 750,00",
    ytd: "85 698,11"
  });

  await page.locator("#pdfInput").setInputFiles({
    name: "offline-second.pdf",
    mimeType: "application/pdf",
    buffer: second
  });
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");

  const records = await page.evaluate(async () => {
    const storage = await import("/storage.js");
    return (await storage.getAllRecords()).map(record => record.values.payDate).sort();
  });

  expect(records).toEqual(["2026-11-27", "2026-12-11"]);

  await context.setOffline(false);
  await page.reload();
  await expect(page.locator("#recordCount")).toContainText("2 palkkalaskelmaa");
});
