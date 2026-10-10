import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePayslip, plainRecord } from "../parser.js";

const expected = {
  payPeriodStart: "2026-09-14",
  payPeriodEnd: "2026-09-27",
  payDate: "2026-10-09",
  grossPay: 3212.79,
  netPay: 1831.61,
  ytdTaxableIncome: 73881.95,
  previousYearTaxableIncome: 78829.16,
  taxCardAccumulatedIncome: 18077.71,
  withholdingPeriod: -1044.16,
  withholdingYtd: -22058.48,
  taxRate: 32.5,
  taxLimit: 40000,
  additionalRate: 47,
  kta: 25.07,
  pp: 19.44,
  overtime100DailyHours: 5.03,
  overtime50WeeklyHours: 8,
  overtime100WeeklyHours: 8,
  overtimeHours: 21.03,
  overtimeCompensation: 426.94,
  sundayHours: 10.55,
  weeklyRestHours: 10.55,
  worktimeBankUseHours: 3.98,
  worktimeBankAddHours: -11.2
};

for (const fixture of ["variant-a.txt", "variant-b.txt"]) {
  test(`${fixture} normalisoituu odotettuihin ydinkenttiin`, async () => {
    const text = await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), "utf8");
    const parsed = parsePayslip(text);
    const record = plainRecord(parsed);
    assert.equal(parsed.documentType, "payslip");
    for (const [key, value] of Object.entries(expected)) assert.equal(record[key], value, key);
  });
}

test("molemmat PDF-rakenteet antavat saman normalisoidun datan", async () => {
  const [a,b] = await Promise.all([
    readFile(new URL("./fixtures/variant-a.txt", import.meta.url), "utf8"),
    readFile(new URL("./fixtures/variant-b.txt", import.meta.url), "utf8")
  ]);
  const ra = plainRecord(parsePayslip(a));
  const rb = plainRecord(parsePayslip(b));
  for (const key of Object.keys(expected)) assert.equal(ra[key], rb[key], key);
});

test("muu dokumentti ei muutu palkkalaskelmaksi", async () => {
  const text = await readFile(new URL("./fixtures/not-a-payslip.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  assert.equal(parsed.documentType, "unknown");
  assert.equal(parsed.overallConfidence, 0);
});

test("tuntematon palkkarivi säilytetään rakenteisena", async () => {
  const text = await readFile(new URL("./fixtures/unknown-payline.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const line = parsed.payLines.find(row => row.code === "47123");
  assert.ok(line);
  assert.equal(line.label, "Tehopalkkio");
  assert.equal(line.category, "incentive");
  assert.equal(line.quantity, 83.5);
  assert.equal(line.unitPrice, 3.17);
  assert.equal(line.amount, 264.7);
});

test("ylityörivin prosenttiluku jää osaksi nimikettä eikä määräksi", async () => {
  const text = await readFile(new URL("./fixtures/variant-a.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const line = parsed.payLines.find(row => row.code === "20040");
  assert.ok(line);
  assert.equal(line.label, "Ylityö 100 % vrk");
  assert.equal(line.quantity, 5.03);
  assert.equal(line.unitPrice, 25.07);
  assert.equal(line.amount, 126.10);
  assert.equal(line.category, "overtime_100_daily");
});

test("legacy-taulukkopohja 2024 tunnistuu palkkalaskelmaksi", async () => {
  const text = await readFile(new URL("./fixtures/legacy-table-2024.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const record = plainRecord(parsed);
  assert.equal(parsed.documentType, "payslip");
  assert.equal(parsed.sourceProfile, "legacy-table-fi-v1");
  assert.equal(record.payPeriodStart, "2024-08-05");
  assert.equal(record.payPeriodEnd, "2024-08-18");
  assert.equal(record.payDate, "2024-08-23");
  assert.equal(record.grossPay, 3264.27);
  assert.equal(record.netPay, 1901.75);
  assert.equal(record.ytdTaxableIncome, 44880.27);
  assert.equal(record.previousYearTaxableIncome, 72440.34);
  assert.equal(record.withholdingPeriod, -1028.25);
  assert.equal(record.withholdingYtd, -11266.72);
  assert.equal(record.taxRate, 31.5);
  assert.equal(record.additionalRate, 43);
  assert.equal(record.taxLimit, 36725.71);
  assert.equal(record.kta, 22.78);
  assert.equal(record.pp, 18.65);
  assert.equal(record.overtime100DailyHours, 5.63);
  assert.equal(record.overtime50WeeklyHours, 8);
  assert.equal(record.overtime100WeeklyHours, 8);
  assert.equal(record.overtimeHours, 21.63);
  assert.equal(record.overtimeCompensation, 401.68);
  assert.equal(record.sundayHours, 10.8);
  assert.equal(record.weeklyRestHours, 10.8);
  assert.equal(record.taxCardAccumulatedIncome, null);
});

test("legacy-palkkarivit normalisoituvat kategorioihin", async () => {
  const text = await readFile(new URL("./fixtures/legacy-table-2024.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const byCode = Object.fromEntries(parsed.payLines.map(line => [line.code, line]));
  assert.equal(byCode["1220"].category, "overtime_100_daily");
  assert.equal(byCode["1230"].category, "overtime_50_weekly");
  assert.equal(byCode["1240"].category, "overtime_100_weekly");
  assert.equal(byCode["1100"].category, "sunday");
  assert.equal(byCode["4200"].category, "worktime_flex");
  assert.equal(byCode["4600"].category, "incentive");
});


test("epäuskottavan pieni verokortin kertymä vaatii tarkistuksen", () => {
  const text = `PALKKALASKELMA/PALKKATODISTUS
Palkkakausi 4.8.2025 - 17.8.2025
Maksupäivä 22.8.2025
Maksetaan 1 952,12
90000 Ennakonpidätys 14,00 -900,00
Ennakonpid. al. tul 3 237,89
Ennakonpid. al. tul 53 124,25
Perusprosentti (0 - 35 000,00€) 30,0%
Lisäprosentti 45,0%`;
  const parsed = parsePayslip(text);
  assert.equal(parsed.documentType, "payslip");
  assert.equal(plainRecord(parsed).taxCardAccumulatedIncome, 14);
  const notice = parsed.notices.find(item => item.code === "tax-card-accumulation-suspiciously-low");
  assert.ok(notice);
  assert.equal(notice.level, "blocking");
  assert.deepEqual(notice.fields, ["taxCardAccumulatedIncome"]);
});

test("pieni verokortin kertymä ei yksin laukaise estoa vuoden ensimmäisellä palkalla", () => {
  const text = `PALKKALASKELMA/PALKKATODISTUS
Palkkakausi 1.1.2026 - 4.1.2026
Maksupäivä 9.1.2026
Maksetaan 80,00
90000 Ennakonpidätys 100,00 -20,00
Ennakonpid. al. tul 100,00
Ennakonpid. al. tul 100,00
Perusprosentti (0 - 35 000,00€) 20,0%
Lisäprosentti 40,0%`;
  const parsed = parsePayslip(text);
  assert.equal(parsed.notices.some(item => item.code === "tax-card-accumulation-suspiciously-low"), false);
});


test("2025 kahden 90000-rivin rakenne valitsee oikean verokortin kertymän", async () => {
  const text = await readFile(new URL("./fixtures/withholding-multiline-2025.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const record = plainRecord(parsed);

  assert.equal(parsed.documentType, "payslip");
  assert.equal(record.grossPay, 858.67);
  assert.equal(record.netPay, 522.74);
  assert.equal(record.ytdTaxableIncome, 47774.38);
  assert.equal(record.taxCardAccumulatedIncome, 47774.38);
  assert.equal(record.withholdingPeriod, -244.72);
  assert.equal(record.withholdingYtd, -13615.70);
  assert.equal(record.taxRate, 28.5);
  assert.equal(record.additionalRate, 45.5);
  assert.equal(record.taxLimit, 77700);
  assert.equal(parsed.notices.some(item => item.code === "tax-card-accumulation-suspiciously-low"), false);
});

test("90000-päivä-/määräriviä ei tulkita verokortin kertymäksi", () => {
  const text = `PALKKALASKELMA/PALKKATODISTUS
Palkkakausi 23.6.2025 - 6.7.2025
Maksupäivä 11.7.2025
Maksetaan 522,74
90000 Ennakonpidätys 30.6.2025 - 27.7.2025 -7,00
Kertymä palkkakaudelta
Ennakonpid. al. tul 858,67
Ennakonpidätys -244,72
Kertymä vuoden alusta
Ennakonpid. al. tul 47 774,38
Ennakonpidätys -13 615,70
Prosentti1 28,5% Tuloraja 77 700,00€
Prosentti2 45,5%`;

  const parsed = parsePayslip(text);
  const record = plainRecord(parsed);
  assert.equal(record.taxCardAccumulatedIncome, null);
  assert.ok(parsed.notices.find(item => item.code === "tax-card-accumulation-missing"));
});


test("kompakti B-formaatti ei joudu väärään legacy-parseriin", async () => {
  const text = await readFile(new URL("./fixtures/test-format-b-compact.txt", import.meta.url), "utf8");
  const parsed = parsePayslip(text);
  const record = plainRecord(parsed);

  assert.equal(parsed.documentType, "payslip");
  assert.equal(record.payPeriodStart, "2026-08-03");
  assert.equal(record.payPeriodEnd, "2026-08-16");
  assert.equal(record.payDate, "2026-08-28");
  assert.equal(record.grossPay, 4698.11);
  assert.equal(record.netPay, 2678.39);
  assert.equal(record.ytdTaxableIncome, 63832.82);
  assert.equal(record.taxCardAccumulatedIncome, 8028.58);
  assert.equal(record.taxRate, 32.5);
  assert.equal(record.additionalRate, 47);
  assert.equal(record.taxLimit, 40000);
  assert.equal(record.kta, 25.07);
  assert.equal(record.pp, 19.44);
});
