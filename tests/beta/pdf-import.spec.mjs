import { test, expect } from "@playwright/test";
import { makeTextPdf } from "../staging/pdf-helper.mjs";

// All fixtures are invented, local-only salary data. No real payslips or identities.
const base = (net = "2 678,39") => [
  "PALKKALASKELMA",
  "Palkkakausi 3.8.2026 - 16.8.2026",
  "Maksupäivä 28.8.2026",
  "Maksetaan " + net,
  "KERTYMÄ PALKKAKAUDELTA",
  "Ennakonpid. al. tul 4 698,11",
  "Ennakonpidätys -1 526,89",
  "Maksetaan " + net,
  "KERTYMÄ VUODEN ALUSTA",
  "Ennakonpid. al. tul 63 832,82",
  "Ennakonpidätys -18 792,51"
];

const synthetic = (name, lines) => ({
  name,
  mimeType: "application/pdf",
  buffer: makeTextPdf(lines)
});
const getRecords = page => page.evaluate(async () => {
  const { getAllRecords } = await import("/storage.js");
  return getAllRecords();
});

test("QA-import-01: Beta imports a real local text PDF and feeds its own analysis without a backup", async ({page}) => {
  await page.goto("/index.html");
  await expect(page.locator("#pdfInput")).toBeEnabled();
  await page.locator("#pdfInput").setInputFiles(synthetic("synthetic-salary.pdf", base()));
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  await expect(page.locator("#resultSection")).toBeVisible();
  const records = await getRecords(page);
  expect(records).toHaveLength(1);
  expect(records[0].values.grossPay).toBe(4698.11);
  expect(records[0].values.netPay).toBe(2678.39);
  expect(records[0].values.ytdTaxableIncome).toBe(63832.82);
  await page.locator("#betaImportBack").click();
  await page.getByRole("button", {name:"Analyysi"}).click();
  await expect(page.locator("#monthlyChart .chart-bar-gross")).toHaveCount(1);
  await page.getByRole("button", {name:"Laskuri"}).click();
  await expect(page.locator("#plannerFrame")).toBeVisible();
  await expect(page.frameLocator("#plannerFrame").locator("#historyStatus")).toContainText("Beta ehdotti luvut", {timeout:15000});
});

test("QA-import-02: reimporting the same PDF does not create a second pay event", async ({page}) => {
  await page.goto("/index.html");
  const slip = synthetic("synthetic-duplicate.pdf", base());
  await page.locator("#pdfInput").setInputFiles(slip);
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  await page.locator("#pdfInput").setInputFiles(slip);
  await expect(page.locator("#status")).toContainText("ilman tuplaa");
  expect(await getRecords(page)).toHaveLength(1);
});

test("QA-import-03: a changed net amount for the same pay period requires explicit conflict resolution", async ({page}) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles(synthetic("original.pdf", base()));
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  await page.locator("#pdfInput").setInputFiles(synthetic("revision.pdf", base("2 700,00")));
  await expect(page.locator("#conflictSection")).toBeVisible();
  await expect(page.locator("#status")).toContainText("Mitään ei yhdistetty automaattisesti");
  const beforeDecision = await getRecords(page);
  expect(beforeDecision).toHaveLength(1);
  expect(beforeDecision[0].values.netPay).toBe(2678.39);
  await page.locator("#cancelConflictButton").click();
  expect(await getRecords(page)).toHaveLength(1);
});

test("QA-import-04: non-payroll PDF cannot create a salary record", async ({page}) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles(synthetic("receipt.pdf", [
    "TILAUSVAHVISTUS", "Päivämäärä 28.8.2026", "Summa 4 698,11", "Kiitos tilauksesta"
  ]));
  await expect(page.locator("#unknownSection")).toBeVisible();
  expect(await getRecords(page)).toHaveLength(0);
});

test("QA-import-05: missing period gross requires review instead of silently borrowing annual YTD", async ({page}) => {
  await page.goto("/index.html");
  await page.locator("#pdfInput").setInputFiles(synthetic("missing-period-gross.pdf", [
    "PALKKALASKELMA",
    "Palkkakausi 3.8.2026 - 16.8.2026",
    "Maksupäivä 28.8.2026",
    "Maksetaan 2 678,39",
    "KERTYMÄ PALKKAKAUDELTA",
    "Ennakonpidätys -1 526,89",
    "KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 63 832,82"
  ]));
  await expect(page.locator("#reviewSection")).toBeVisible();
  expect(await getRecords(page)).toHaveLength(0);
});

test("QA-import-06: import does not require external PDF runtime requests", async ({page}) => {
  const remote = [];
  page.on("request", r => {if (/^https?:\/\//.test(r.url()) && !/127\.0\.0\.1:4177/.test(r.url())) remote.push(r.url());});
  await page.route("https://**/*", route => route.abort());
  await page.goto("/index.html");
  // A file input is visible before the Beta entry module has finished wiring
  // its change handler; wait for the first completed startup render.
  await expect(page.locator("#historyYear option")).toHaveCount(1);
  await page.locator("#pdfInput").setInputFiles(synthetic("offline-readable.pdf", base()));
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  expect(remote).toEqual([]);
});


test("QA-import-07: user teaches a new layout once; the next PDF of the same layout imports without retyping", async ({page}) => {
  await page.goto("/index.html");
  const unusual = ({period, date, net, gross, ytd}) => [
    "PALKKALASKELMA",
    "Palkkakausi " + period,
    "Maksupäivä " + date,
    "Maksetaan " + net,
    "KAUDEN YHTEENVETO",
    "Jakson veropohja " + gross,
    "VUODEN YHTEENVETO",
    "Kertyvä veropohja " + ytd
  ];
  const first = unusual({
    period:"3.8.2026 - 16.8.2026", date:"28.8.2026",
    net:"2 678,39", gross:"4 698,11", ytd:"63 832,82"
  });
  await page.locator("#pdfInput").setInputFiles(synthetic("new-template-first.pdf",first));
  await expect(page.locator("#reviewSection")).toBeVisible();
  await expect(page.locator('#reviewGrid input[data-key="grossPay"]')).toBeVisible();
  await expect(page.locator('#reviewGrid input[data-key="ytdTaxableIncome"]')).toBeVisible();
  expect(await getRecords(page)).toHaveLength(0);

  await page.locator('#reviewGrid input[data-key="grossPay"]').fill("4698,11");
  await page.locator('#reviewGrid input[data-key="ytdTaxableIncome"]').fill("63832,82");
  await page.locator("#saveButton").click();
  await expect(page.locator("#status")).toContainText("Korjaus tallennettu");
  const profiles = await page.evaluate(async () => {
    const { getSetting } = await import("/storage.js");
    return await getSetting("learnedLayoutProfiles:v1");
  });
  expect(profiles).toHaveLength(1);
  expect(profiles[0].mappings.map(m => m.field).sort()).toEqual(["grossPay","ytdTaxableIncome"]);

  const next = unusual({
    period:"17.8.2026 - 30.8.2026", date:"11.9.2026",
    net:"1 881,34", gross:"3 300,02", ytd:"67 132,84"
  });
  await page.locator("#pdfInput").setInputFiles(synthetic("same-template-next.pdf",next));
  await expect(page.locator("#status")).toContainText("tallennettiin automaattisesti");
  const records = await getRecords(page);
  expect(records).toHaveLength(2);
  const last = records.find(r => r.values.payDate === "2026-09-11");
  expect(last?.values.grossPay).toBe(3300.02);
  expect(last?.values.ytdTaxableIncome).toBe(67132.84);
  expect(last?.values.netPay).toBe(1881.34);
});

test("QA-import-08: new ambiguous format still requires review even after the user taught an older one", async ({page}) => {
  await page.goto("/index.html");
  const first = [
    "PALKKALASKELMA", "Palkkakausi 3.8.2026 - 16.8.2026",
    "Maksupäivä 28.8.2026", "Maksetaan 2 678,39",
    "KAUDEN YHTEENVETO", "Jakson veropohja 4 698,11",
    "VUODEN YHTEENVETO", "Kertyvä veropohja 63 832,82"
  ];
  await page.locator("#pdfInput").setInputFiles(synthetic("format-one.pdf",first));
  await expect(page.locator("#reviewSection")).toBeVisible();
  await page.locator('#reviewGrid input[data-key="grossPay"]').fill("4698,11");
  await page.locator('#reviewGrid input[data-key="ytdTaxableIncome"]').fill("63832,82");
  await page.locator("#saveButton").click();
  await expect(page.locator("#status")).toContainText("Korjaus tallennettu");

  // Only headings differ; same-looking amounts must not bypass source evidence.
  const changed = [
    "PALKKALASKELMA", "Palkkakausi 17.8.2026 - 30.8.2026",
    "Maksupäivä 11.9.2026", "Maksetaan 1 881,34",
    "ERILLISKORVAUKSET", "Jakson veropohja 3 300,02",
    "SEURAAVAN VUODEN ARVIOT", "Kertyvä veropohja 67 132,84"
  ];
  await page.locator("#pdfInput").setInputFiles(synthetic("format-changed.pdf",changed));
  await expect(page.locator("#reviewSection")).toBeVisible();
  expect(await getRecords(page)).toHaveLength(1);
});
