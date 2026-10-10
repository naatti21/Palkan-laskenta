import test from "node:test";
import assert from "node:assert/strict";
import { parsePayslip, plainRecord } from "../parser.js";

const assertClose = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ≈ ${expected}`);

const alternateFormat = `PALKANMAKSUN YHTEENVETO - TESTI
Jakso 3.8.2026 - 16.8.2026
Palkanmaksupäivä 28.8.2026
Käteen maksettava 2 678,39
Veronalainen ansio / kausi 4 698,11
Vuositulo tähän asti 63 832,82
Nykyisen verokortin kertymä 8 028,58
Pidätysprosentti 32,5 %
Vuosituloraja 40 000,00
Lisäprosentti 47,0 %
KTA 25,07
PP 19,44

PALKAN OSAT
13001 Palkkiotyö 97,14 19,44 1 888,41
13101 Porakonepalkkio 97,14 5,18 503,19
20040 Ylityö 100 % vrk 4,15 25,07 104,04
20050 Ylityö 50 % vko 7,90 25,07 99,03
20060 Ylityö 100 % vko 8,00 25,07 200,56
20070 Tes ylityö 50 % 0,10 25,07 1,25
20110 Sunnuntaityö 11,32 25,07 283,79
20120 Viikkovapaakorvaus 11,32 25,07 283,79
90000 Ennakonpidätys 8 028,58 -1 526,89
`;

test("uusi sanasto normalisoituu ilman käsin syötettäviä ydinkenttiä", () => {
  const parsed = parsePayslip(alternateFormat);
  const r = plainRecord(parsed);

  assert.equal(parsed.documentType, "payslip");
  assert.equal(parsed.overallConfidence, 1);
  assert.equal(r.payPeriodStart, "2026-08-03");
  assert.equal(r.payPeriodEnd, "2026-08-16");
  assert.equal(r.payDate, "2026-08-28");
  assert.equal(r.grossPay, 4698.11);
  assert.equal(r.netPay, 2678.39);
  assert.equal(r.ytdTaxableIncome, 63832.82);
  assert.equal(r.taxCardAccumulatedIncome, 8028.58);
  assert.equal(r.taxRate, 32.5);
  assert.equal(r.taxLimit, 40000);
  assert.equal(r.additionalRate, 47);
  assert.equal(r.kta, 25.07);
  assert.equal(r.pp, 19.44);
  assertClose(r.overtimeHours, 20.15);
  assertClose(r.overtimeCompensation, 404.88);
});

test("välilyönti- ja rivivaihtelut eivät muuta ydintulkintaa", () => {
  const noisy = alternateFormat
    .replace(/ /g, "   ")
    .replace(/\n/g, "\n\n");
  const r = plainRecord(parsePayslip(noisy));

  assert.equal(r.payDate, "2026-08-28");
  assert.equal(r.grossPay, 4698.11);
  assert.equal(r.netPay, 2678.39);
  assert.equal(r.ytdTaxableIncome, 63832.82);
  assert.equal(r.taxCardAccumulatedIncome, 8028.58);
  assertClose(r.overtimeHours, 20.15);
});

test("erittelyssä varmasti puuttuva ylityö on 0 h eikä null", () => {
  const text = `PALKKALASKELMA
Palkkakausi 1.1.2026 - 14.1.2026
Maksupäivä 16.1.2026
Maksetaan 1 700,00
Prosentti1 25,0% Tuloraja 40 000,00€
Prosentti2 45,0%

ERITTELY
13001 Palkkiotyö 100,00 25,00 2 500,00
90000 Ennakonpidätys 2 500,00 -625,00

Kertymä palkkakaudelta
Ennakonpid. al. tul 2 500,00
Ennakonpidätys -625,00
Kertymä vuoden alusta
Ennakonpid. al. tul 2 500,00
Ennakonpidätys -625,00`;

  const r = plainRecord(parsePayslip(text));
  assert.equal(r.overtimeHours, 0);
  assert.equal(r.overtimeCompensation, 0);
});

test("ilman luotettavasti luettua palkkarivierittelyä ylityö jää tuntemattomaksi", () => {
  const text = `PALKKALASKELMA
Palkkakausi 1.1.2026 - 14.1.2026
Maksupäivä 16.1.2026
Maksetaan 1 700,00
Kertymä palkkakaudelta
Ennakonpid. al. tul 2 500,00
Kertymä vuoden alusta
Ennakonpid. al. tul 2 500,00`;

  const r = plainRecord(parsePayslip(text));
  assert.equal(r.overtimeHours, null);
  assert.equal(r.overtimeCompensation, null);
});

test("semanttisesti uusi formaatti tuottaa neutraalit rakennesignaalit", () => {
  const parsed = parsePayslip(alternateFormat);
  assert.ok(parsed.structureSignals.includes("title:palkkalaskelma"));
  assert.ok(parsed.structureSignals.includes("label:palkkakausi"));
  assert.ok(parsed.structureSignals.includes("label:maksupaiva"));
  assert.ok(parsed.structureSignals.includes("label:ver-al-ans"));
  assert.ok(parsed.structureSignals.includes("label:tuloraja"));
  assert.ok(parsed.structureSignals.includes("section:erittely"));
});
