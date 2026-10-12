import test from "node:test";
import assert from "node:assert/strict";
import { parsePayslip } from "../parser.js";

const shared = [
  "PALKKALASKELMA",
  "Palkkakausi 1.12.2026 - 14.12.2026",
  "Maksupäivä 18.12.2026",
  "Maksetaan 2 100,00",
  "77777 QA-erikoislisä 2,00 60,00 120,00",
  "KERTYMÄ EDELLISELTÄ VUODELTA KERTYMÄ PALKKAKAUDELTA KERTYMÄ VUODEN ALUSTA",
  "Ennakonpid. al. tul 55 000,00 Ennakonpid. al. tul 3 500,00 Ennakonpid. al. tul 42 000,00",
  "Ennakonpidätys -13 750,00 Ennakonpidätys -875,00 Ennakonpidätys -10 500,00"
];
const read = (...extras) => parsePayslip([...shared, ...extras].join("\n"));
const blocking = (p, field) => p.notices.some(n => n.level === "blocking" && n.fields?.includes(field));

test("independent QA RC-P0-01: period 3500 vs section 3600 is blocked, both candidates retained", () => {
  const parsed = read("Kauden tiedot", "Ver.al.ans 3 600,00");
  assert.equal(parsed.fields.grossPay.value, 3600);
  assert.deepEqual(parsed.fields.grossPay.candidates, [3600, 3500]);
  assert.equal(parsed.fields.grossPay.conflict, true);
  assert.ok(parsed.fields.grossPay.confidence < .95);
  assert.ok(blocking(parsed, "grossPay"));
  assert.equal(parsed.fields.ytdTaxableIncome.value, 42000);
  assert.equal(parsed.fields.previousYearTaxableIncome.value, 55000);
});

test("cross-source order and candidate values cannot suppress a period conflict", () => {
  const parsed = read("Kauden tiedot", "Ver.al.ans 3 400,00");
  assert.equal(parsed.fields.grossPay.conflict, true);
  assert.deepEqual(parsed.fields.grossPay.candidates, [3400,3500]);
  assert.ok(blocking(parsed, "grossPay"));
});

test("matching period values across section and cumulative source remain safe", () => {
  const parsed = read("Kauden tiedot", "Ver.al.ans 3 500,00");
  assert.equal(parsed.fields.grossPay.value, 3500);
  assert.equal(parsed.fields.grossPay.conflict, undefined);
  assert.equal(parsed.fields.grossPay.confidence, .97);
  assert.equal(blocking(parsed, "grossPay"), false);
});

test("YTD section conflicting with cumulative YTD is blocked and preserved", () => {
  const parsed = read(
    "Kauden tiedot", "Ver.al.ans 3 500,00",
    "Vuoden tiedot", "Ver.al.ans 43 000,00"
  );
  assert.equal(parsed.fields.grossPay.value, 3500);
  assert.equal(parsed.fields.ytdTaxableIncome.value, 43000);
  assert.deepEqual(parsed.fields.ytdTaxableIncome.candidates, [43000,42000]);
  assert.equal(parsed.fields.ytdTaxableIncome.conflict, true);
  assert.ok(parsed.fields.ytdTaxableIncome.confidence < .95);
  assert.ok(blocking(parsed, "ytdTaxableIncome"));
  assert.equal(blocking(parsed, "grossPay"), false);
});

test("matching YTD from year section does not block even with other distinct roles", () => {
  const parsed = read(
    "Kauden tiedot", "Ver.al.ans 3 500,00",
    "Vuoden tiedot", "Ver.al.ans 42 000,00"
  );
  assert.equal(parsed.fields.ytdTaxableIncome.value, 42000);
  assert.equal(parsed.fields.ytdTaxableIncome.conflict, undefined);
  assert.ok(!parsed.notices.some(n => n.level === "blocking"));
});

test("period and YTD can legitimately have equal values when section sources agree", () => {
  const custom = shared.map(line => line.replace("42 000,00", "3 500,00"));
  const parsed = parsePayslip([...custom, "Kauden tiedot", "Ver.al.ans 3 500,00", "Vuoden tiedot", "Ver.al.ans 3 500,00"].join("\n"));
  assert.equal(parsed.fields.grossPay.value, 3500);
  assert.equal(parsed.fields.ytdTaxableIncome.value, 3500);
  assert.equal(blocking(parsed, "grossPay"), false);
  assert.equal(blocking(parsed, "ytdTaxableIncome"), false);
});
