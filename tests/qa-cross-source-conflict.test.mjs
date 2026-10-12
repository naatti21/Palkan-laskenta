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

test("QA A903-P0-01: explicit pay-period salary 3600 contradicts cumulative 3500", () => {
  const p = read("Veronalainen palkka / kausi 3 600,00");
  assert.equal(p.fields.grossPay.value, 3500);
  assert.deepEqual(p.fields.grossPay.candidates, [3500, 3600]);
  assert.equal(p.fields.grossPay.conflict, true);
  assert.ok(p.fields.grossPay.confidence < .95);
  assert.ok(blocking(p, "grossPay"));
  assert.equal(p.notices.some(n => n.level === "blocking" && n.fields?.includes("ytdTaxableIncome")), false);
});

test("period-salary label variants feed the same mandatory cross-source gate", () => {
  for (const label of [
    "Veronalainen ansio / kausi",
    "Veronalainen palkka palkkakaudelta",
    "Kauden veronalainen palkka",
    "Kauden veronalainen ansio"
  ]) {
    const p = read(label + " 3 600,00");
    assert.deepEqual(p.fields.grossPay.candidates, [3500, 3600], label);
    assert.ok(blocking(p, "grossPay"), label);
  }
});

test("two explicit pay-period observations conflict even without a cumulative amount", () => {
  const p = parsePayslip([
    "PALKKALASKELMA",
    "Palkkakausi 1.1.2027 - 14.1.2027",
    "Maksupäivä 29.1.2027",
    "Maksetaan 2 100,00",
    "Veronalainen palkka / kausi 3 500,00",
    "Kauden veronalainen ansio 3 600,00",
    "Veronalainen YTD 42 000,00"
  ].join("\n"));
  assert.deepEqual(p.fields.grossPay.candidates, [3500, 3600]);
  assert.ok(blocking(p, "grossPay"));
});

test("matching explicit period and cumulative values are not a false conflict", () => {
  const p = read("Veronalainen palkka / kausi 3 500,00");
  assert.equal(p.fields.grossPay.value, 3500);
  assert.equal(p.fields.grossPay.conflict, undefined);
  assert.ok(!blocking(p, "grossPay"));
});

test("unqualified YTD-section Ver.al.ans is not misclassified as pay-period evidence", () => {
  const p = read("Vuoden tiedot", "Ver.al.ans 42 000,00");
  assert.equal(p.fields.grossPay.value, 3500);
  assert.equal(p.fields.ytdTaxableIncome.value, 42000);
  assert.equal(blocking(p, "grossPay"), false);
  assert.equal(blocking(p, "ytdTaxableIncome"), false);
});

test("all three explicit period labels and cumulative value are preserved on disagreement", () => {
  const p = read(
    "Veronalainen palkka / kausi 3 600,00",
    "Kauden veronalainen ansio 3 700,00",
    "Kauden tiedot",
    "Ver.al.ans 3 800,00"
  );
  assert.equal(p.fields.grossPay.conflict, true);
  assert.deepEqual(p.fields.grossPay.candidates, [3800, 3500, 3600, 3700]);
  assert.ok(blocking(p, "grossPay"));
});

test("QA IMPORT-P0-02: two different Ver.al.ans in one period section must block silent autosave", () => {
  const p = read("Kauden tiedot", "Ver.al.ans 3 500,00", "Ver.al.ans 3 600,00");
  assert.equal(p.fields.grossPay.value, 3500);
  assert.deepEqual(p.fields.grossPay.candidates, [3500, 3600]);
  assert.equal(p.fields.grossPay.conflict, true);
  assert.ok(p.fields.grossPay.confidence < .95);
  assert.ok(blocking(p, "grossPay"));
  assert.equal(p.fields.ytdTaxableIncome.value, 42000);
  assert.equal(blocking(p, "ytdTaxableIncome"), false);
});

test("same period value repeated twice is not a false-positive conflict", () => {
  const p = read("Kauden tiedot", "Ver.al.ans 3 500,00", "Ver.al.ans 3 500,00");
  assert.equal(p.fields.grossPay.conflict, undefined);
  assert.ok(!blocking(p, "grossPay"));
});

test("period section ends before year section, so YTD value does not become period candidate", () => {
  const p = read("Kauden tiedot", "Ver.al.ans 3 500,00", "Vuoden tiedot", "Ver.al.ans 42 000,00");
  assert.equal(p.fields.grossPay.conflict, undefined);
  assert.equal(p.fields.ytdTaxableIncome.conflict, undefined);
  assert.ok(!blocking(p, "grossPay"));
  assert.ok(!blocking(p, "ytdTaxableIncome"));
});

test("QA IMPORT-P0-02 also blocks two different year-section YTD observations", () => {
  const p = read("Vuoden tiedot", "Ver.al.ans 42 000,00", "Ver.al.ans 43 000,00");
  assert.equal(p.fields.ytdTaxableIncome.value, 42000);
  assert.deepEqual(p.fields.ytdTaxableIncome.candidates, [42000, 43000]);
  assert.equal(p.fields.ytdTaxableIncome.conflict, true);
  assert.ok(blocking(p, "ytdTaxableIncome"));
  assert.equal(blocking(p, "grossPay"), false);
});

test("repeated named period sections also retain both semantic observations", () => {
  const p = read("Kauden tiedot", "Ver.al.ans 3 500,00",
    "Vuoden tiedot", "Ver.al.ans 42 000,00",
    "Kauden tiedot", "Ver.al.ans 3 600,00");
  assert.equal(p.fields.grossPay.conflict, true);
  assert.deepEqual(p.fields.grossPay.candidates, [3500, 3600]);
  assert.ok(blocking(p, "grossPay"));
});
