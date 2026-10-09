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
  assert.equal(line.category, "overtime_100");
});
