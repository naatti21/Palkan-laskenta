import test from "node:test";
import assert from "node:assert/strict";
import { parsePayslip, plainRecord } from "../parser.js";

test("QA-02: puuttuva kauden brutto ei lainaa vuoden kertymää", () => {
  const text = `PALKKALASKELMA
Palkkakausi 3.8.2026 - 16.8.2026
Maksupäivä 28.8.2026
Maksetaan 2 678,39
KERTYMÄ PALKKAKAUDELTA
Ennakonpidätys -1 526,89
Maksetaan 2 678,39
KERTYMÄ VUODEN ALUSTA
Ennakonpid. al. tul 63 832,82
Ennakonpidätys -18 792,51`;

  const parsed = parsePayslip(text);
  const record = plainRecord(parsed);

  assert.equal(parsed.documentType, "payslip");
  assert.equal(record.grossPay, null);
  assert.equal(record.ytdTaxableIncome, 63832.82);
  assert.equal(parsed.fields.grossPay.confidence, 0);
});

test("QA-03: ristiriitaiset nettoarvot eivät saa korkeaa confidencea", () => {
  const text = `PALKKALASKELMA
Palkkakausi 3.8.2026 - 16.8.2026
Maksupäivä 28.8.2026
Maksetaan 2 678,39
Maksetaan 2 700,00
KERTYMÄ PALKKAKAUDELTA
Ennakonpid. al. tul 4 698,11
KERTYMÄ VUODEN ALUSTA
Ennakonpid. al. tul 63 832,82`;

  const parsed = parsePayslip(text);

  assert.equal(parsed.documentType, "payslip");
  assert.ok(parsed.fields.netPay.confidence < 0.95);
  const notice = parsed.notices.find(item => item.code === "net-pay-conflict");
  assert.ok(notice);
  assert.equal(notice.level, "blocking");
  assert.deepEqual(notice.fields, ["netPay"]);
});

test("QA-03: sama netto kahdessa luotettavassa paikassa ei ole ristiriita", () => {
  const text = `PALKKALASKELMA
Palkkakausi 3.8.2026 - 16.8.2026
Maksupäivä 28.8.2026
Maksetaan 2 678,39
Maksetaan 2 678,39
KERTYMÄ PALKKAKAUDELTA
Ennakonpid. al. tul 4 698,11
KERTYMÄ VUODEN ALUSTA
Ennakonpid. al. tul 63 832,82`;

  const parsed = parsePayslip(text);
  assert.equal(parsed.fields.netPay.value, 2678.39);
  assert.ok(parsed.fields.netPay.confidence >= 0.95);
  assert.equal(parsed.notices.some(item => item.code === "net-pay-conflict"), false);
});

test("QA-04: mahdoton maksupäivä ei kelpaa kalenteripäiväksi", () => {
  const text = `PALKKALASKELMA
Palkkakausi 3.2.2026 - 16.2.2026
Maksupäivä 31.2.2026
Maksetaan 2 678,39
KERTYMÄ PALKKAKAUDELTA
Ennakonpid. al. tul 4 698,11
KERTYMÄ VUODEN ALUSTA
Ennakonpid. al. tul 63 832,82`;

  const parsed = parsePayslip(text);
  assert.equal(parsed.fields.payDate.value, null);
  assert.equal(parsed.fields.payDate.confidence, 0);
});

test("QA-04: oikea karkauspäivä hyväksytään", () => {
  const text = `PALKKALASKELMA
Palkkakausi 15.2.2024 - 28.2.2024
Maksupäivä 29.2.2024
Maksetaan 1 900,00
KERTYMÄ PALKKAKAUDELTA
Ennakonpid. al. tul 3 000,00
KERTYMÄ VUODEN ALUSTA
Ennakonpid. al. tul 6 000,00`;

  const parsed = parsePayslip(text);
  assert.equal(parsed.fields.payDate.value, "2024-02-29");
  assert.ok(parsed.fields.payDate.confidence >= 0.95);
});

test("M09: en dash toimii palkkakauden erottimena", () => {
  const text = `PALKKALASKELMA
Palkkakausi 3.8.2026 – 16.8.2026
Maksupäivä 28.8.2026
Maksetaan 2 678,39
KERTYMÄ PALKKAKAUDELTA
Ennakonpid. al. tul 4 698,11
KERTYMÄ VUODEN ALUSTA
Ennakonpid. al. tul 63 832,82`;

  const parsed = parsePayslip(text);
  assert.equal(parsed.fields.payPeriodStart.value, "2026-08-03");
  assert.equal(parsed.fields.payPeriodEnd.value, "2026-08-16");
});
