import test from "node:test";
import assert from "node:assert/strict";
import { parsePayslip, plainRecord } from "../parser.js";

const base = [
  "PALKKALASKELMA",
  "Palkkakausi 15.10.2026 - 28.10.2026",
  "Maksupäivä 13.11.2026",
  "Maksetaan 2 100,00"
];
const headings = {
  period: "KERTYMÄ PALKKAKAUDELTA",
  ytd: "KERTYMÄ VUODEN ALUSTA",
  previous: "KERTYMÄ EDELLISELTÄ VUODELTA"
};
const earnings = { period: "3 500,00", ytd: "42 000,00", previous: "55 000,00" };
const withholding = { period: "-875,00", ytd: "-10 500,00", previous: "-13 750,00" };
const permutations = [
  ["period", "ytd", "previous"], ["period", "previous", "ytd"],
  ["ytd", "period", "previous"], ["ytd", "previous", "period"],
  ["previous", "period", "ytd"], ["previous", "ytd", "period"]
];

function table(order, { partialTaxable = false, partialWithholding = false, unknownLine = false } = {}) {
  const heads = order.map(k => headings[k]).join("    ");
  const taxable = order.filter(k => !(partialTaxable && k === "ytd"))
    .map(k => `Ennakonpid. al. tul ${earnings[k]}`).join("    ");
  const tax = order.filter(k => !(partialWithholding && k === "ytd"))
    .map(k => `Ennakonpidätys ${withholding[k]}`).join("    ");
  return [...base, ...(unknownLine ? ["77777 QA-erikoislisä 2,00 60,00 120,00"] : []), heads, taxable, tax].join("\n");
}

for (const order of permutations) {
  test(`QA F1: header permutation ${order.join("/")}`, () => {
    const parsed = parsePayslip(table(order));
    const out = plainRecord(parsed);
    assert.equal(out.grossPay, 3500);
    assert.equal(out.ytdTaxableIncome, 42000);
    assert.equal(out.previousYearTaxableIncome, 55000);
    assert.equal(out.withholdingPeriod, -875);
    assert.equal(out.withholdingYtd, -10500);
    assert.equal(parsed.notices.filter(n => n.level === "blocking").length, 0);
    assert.equal(parsed.fields.grossPay.confidence >= 0.95, true);
  });
}

test("QA F2: unknown pay item is not evidence of zero overtime", () => {
  const parsed = parsePayslip(table(permutations[0], { unknownLine: true }));
  assert.equal(parsed.payLines[0].category, "unknown");
  assert.equal(plainRecord(parsed).overtimeHours, null);
  assert.equal(plainRecord(parsed).overtimeCompensation, null);
});

test("QA F5: partial taxable row retains candidates but stops silent acceptance", () => {
  const parsed = parsePayslip(table(permutations[0], { partialTaxable: true }));
  assert.equal(parsed.fields.grossPay.value, null);
  assert.equal(parsed.fields.ytdTaxableIncome.value, null);
  assert.deepEqual(parsed.fields.grossPay.candidates, [3500,55000]);
  assert.ok(parsed.notices.some(n => n.code === "ambiguous-parallel-column-grossPay" && n.level === "blocking"));
});

test("QA F5: partial withholding row retains candidates and blocks silent acceptance", () => {
  const parsed = parsePayslip(table(permutations[0], { partialWithholding: true }));
  assert.equal(parsed.fields.grossPay.value, 3500);
  assert.equal(parsed.fields.ytdTaxableIncome.value, 42000);
  assert.equal(parsed.fields.withholdingPeriod.value, null);
  assert.deepEqual(parsed.fields.withholdingPeriod.candidates, [-875,-13750]);
  assert.ok(parsed.notices.some(n => n.code === "ambiguous-parallel-column-withholdingPeriod"));
});

test("QA: two equal values are distinct roles and safe", () => {
  const text = [...base, "KERTYMÄ PALKKAKAUDELTA  KERTYMÄ VUODEN ALUSTA",
    "Ennakonpid. al. tul 3 500,00 Ennakonpid. al. tul 3 500,00",
    "Ennakonpidätys -875,00 Ennakonpidätys -875,00"].join("\n");
  const parsed = parsePayslip(text);
  assert.equal(parsed.fields.grossPay.value, 3500);
  assert.equal(parsed.fields.ytdTaxableIncome.value, 3500);
  assert.equal(parsed.notices.some(n => n.level === "blocking"), false);
});
